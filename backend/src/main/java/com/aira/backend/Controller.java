package com.aira.backend;

import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.anthropic.AnthropicChatModel;
import dev.langchain4j.model.googleai.GoogleAiGeminiChatModel;
import dev.langchain4j.model.mistralai.MistralAiChatModel;
// import dev.langchain4j.model.cohere.CohereChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class Controller {

    @Value("${app.encryption.key:YourSecretKey12345}")
    private String encryptionKey;

    @Autowired
    private ApiKeyRepository apiKeyRepository;

    @Autowired
    private WinnerSelectionRepository winnerRepository;

    @Autowired
    private ChatHistoryRepository chatHistoryRepository;

    // Langchain4j handles connections so we omit manual HTTP clients

    @PostMapping("/api/models/provider")
    public Map<String, Object> getModels(@RequestBody Map<String, String> body) {
        String providerName = body.get("provider");
        List<String> models;

        switch (providerName.toLowerCase()) {
            case "openai":
                models = List.of("gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "gpt-3.5-turbo-16k");
                break;
            case "claude":
                models = List.of("claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022",
                        "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307");
                break;
            case "cohere":
                models = List.of("command-a-03-2025", "command-r7b-12-2024", "command-a-translate-08-2025",
                        "command-a-reasoning-08-2025", "command-a-vision-07-2025", "command-r-08-2024",
                        "command-r-plus-08-2024", "command-r-03-2024");
                break;
            case "copilot":
                models = List.of("gpt-4-turbo", "gpt-4");
                break;
            case "deepseek":
                models = List.of("deepseek-chat", "deepseek-coder");
                break;
            case "gemini":
                models = List.of("gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro");
                break;
            case "grok":
                models = List.of("grok-beta", "grok-vision-beta");
                break;
            case "llama":
                models = List.of("llama-3.3-70b-instruct", "llama-3.1-405b-instruct", "llama-3.1-70b-instruct",
                        "llama-3.1-8b-instruct", "llama-3-70b-instruct", "llama-3-8b-instruct");
                break;
            case "mistral":
                models = List.of("mistral-large-latest", "mistral-medium-latest", "mistral-small-latest",
                        "mixtral-8x7b-instruct", "mixtral-8x22b-instruct");
                break;
            case "qwen":
                models = List.of("qwen-turbo", "qwen-plus", "qwen-max", "qwen2.5-72b-instruct", "qwen2.5-7b-instruct");
                break;
            default:
                models = List.of();
                break;
        }

        return Map.of("models", models);
    }

    @PostMapping("/api/keys/save")
    public ResponseEntity<Map<String, Object>> saveApiKey(
            @RequestBody Map<String, String> body,
            HttpServletRequest request,
            HttpServletResponse response) {
        try {
            String provider = body.get("provider");
            String apiKey = body.get("apiKey");

            if (provider == null || apiKey == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Provider and API key are required"));
            }

            String encrypted = encrypt(apiKey);
            String sessionId = getOrCreateSessionId(request, response);

            // Save to database
            ApiKey apiKeyEntity = apiKeyRepository.findBySessionIdAndProvider(sessionId, provider)
                    .orElse(new ApiKey());

            apiKeyEntity.setSessionId(sessionId);
            apiKeyEntity.setProvider(provider);
            apiKeyEntity.setEncryptedKey(encrypted);
            apiKeyEntity.setUpdatedAt(new Date());

            apiKeyRepository.save(apiKeyEntity);

            return ResponseEntity.ok(Map.of("success", true, "message", "API key saved successfully"));

        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to save API key: " + e.getMessage()));
        }
    }

    @PostMapping("/api/keys/get")
    public ResponseEntity<Map<String, Object>> getApiKey(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String provider = body.get("provider");
            String sessionId = getSessionId(request);

            if (sessionId == null) {
                return ResponseEntity.ok(Map.of("apiKey", (Object) null));
            }

            Optional<ApiKey> apiKeyOpt = apiKeyRepository.findBySessionIdAndProvider(sessionId, provider);

            if (apiKeyOpt.isEmpty()) {
                return ResponseEntity.ok(Map.of("apiKey", (Object) null));
            }

            return ResponseEntity.ok(Map.of("apiKey", apiKeyOpt.get().getEncryptedKey()));

        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to retrieve API key"));
        }
    }

    @PostMapping("/api/process")
    public ResponseEntity<Map<String, Object>> processChat(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        long startTime = System.currentTimeMillis();

        try {
            String modelIdentifier = body.get("modelIdentifier");
            String prompt = body.get("prompt");
            String encryptedApiKey = body.get("encryptedApiKey");

            // Validate inputs
            if (encryptedApiKey == null || encryptedApiKey.trim().isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "API key not found. Please add it using the + button.", "success",
                                false));
            }

            if (prompt == null || prompt.trim().isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "Prompt is required", "success", false));
            }

            String provider = modelIdentifier.split("-")[0];
            String modelName = extractModelName(modelIdentifier);
            String apiKey = decrypt(encryptedApiKey);

            String aiResponse = callAiApi(provider, modelName, prompt, apiKey);

            // Save to chat history
            String sessionId = getSessionId(request);
            if (sessionId != null) {
                ChatHistory history = new ChatHistory();
                history.setSessionId(sessionId);
                history.setModelIdentifier(modelIdentifier);
                history.setPrompt(prompt);
                history.setResponse(aiResponse);
                history.setResponseTimeMs((int) (System.currentTimeMillis() - startTime));
                chatHistoryRepository.save(history);
            }

            return ResponseEntity.ok(Map.of("reply", aiResponse, "success", true));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage(), "success", false));
        }
    }

    @PostMapping("/api/select-winner")
    public ResponseEntity<Map<String, Object>> selectWinner(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String modelIdentifier = body.get("modelIdentifier");
            String prompt = body.get("prompt");
            String aiResponse = body.get("response");
            String sessionId = getSessionId(request);

            WinnerSelection winner = new WinnerSelection();
            winner.setModelIdentifier(modelIdentifier);
            winner.setPrompt(prompt);
            winner.setResponse(aiResponse);
            winner.setSessionId(sessionId);

            winnerRepository.save(winner);

            return ResponseEntity.ok(Map.of("success", true, "message", "Winner recorded successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to record winner: " + e.getMessage()));
        }
    }

    // ==================== Chat History Endpoints ====================

    @GetMapping("/api/history")
    public ResponseEntity<Map<String, Object>> getChatHistory(HttpServletRequest request) {
        try {
            String sessionId = getSessionId(request);
            if (sessionId == null) {
                return ResponseEntity.ok(Map.of("history", List.of()));
            }

            List<ChatHistory> history = chatHistoryRepository.findBySessionIdOrderByCreatedAtDesc(sessionId);

            List<Map<String, Object>> historyList = history.stream().map(h -> {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", h.getId());
                entry.put("modelIdentifier", h.getModelIdentifier());
                entry.put("prompt", h.getPrompt());
                entry.put("response", h.getResponse());
                entry.put("createdAt", h.getCreatedAt());
                entry.put("responseTimeMs", h.getResponseTimeMs());
                return entry;
            }).toList();

            return ResponseEntity.ok(Map.of("history", historyList));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch chat history"));
        }
    }

    // ==================== Winner / Leaderboard Endpoints ====================

    @GetMapping("/api/winners")
    public ResponseEntity<Map<String, Object>> getWinners(HttpServletRequest request) {
        try {
            String sessionId = getSessionId(request);
            if (sessionId == null) {
                return ResponseEntity.ok(Map.of("winners", List.of()));
            }

            List<WinnerSelection> winners = winnerRepository.findBySessionId(sessionId);

            List<Map<String, Object>> winnerList = winners.stream().map(w -> {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", w.getId());
                entry.put("modelIdentifier", w.getModelIdentifier());
                entry.put("prompt", w.getPrompt());
                entry.put("response", w.getResponse());
                entry.put("selectedAt", w.getSelectedAt());
                return entry;
            }).toList();

            return ResponseEntity.ok(Map.of("winners", winnerList));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch winners"));
        }
    }

    @GetMapping("/api/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        try {
            List<WinnerSelection> allWinners = winnerRepository.findAll();

            // Count wins per model identifier (extract provider-model portion)
            Map<String, Long> winCounts = new LinkedHashMap<>();
            for (WinnerSelection w : allWinners) {
                String key = extractProviderAndModel(w.getModelIdentifier());
                winCounts.merge(key, 1L, Long::sum);
            }

            // Sort by count descending
            List<Map<String, Object>> leaderboard = winCounts.entrySet().stream()
                    .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                    .map(e -> {
                        Map<String, Object> entry = new LinkedHashMap<>();
                        entry.put("model", e.getKey());
                        entry.put("wins", e.getValue());
                        return entry;
                    })
                    .toList();

            return ResponseEntity.ok(Map.of(
                    "leaderboard", leaderboard,
                    "totalSelections", allWinners.size()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to fetch stats"));
        }
    }

    // ==================== API Key Management Endpoints ====================

    @GetMapping("/api/keys/list")
    public ResponseEntity<Map<String, Object>> listApiKeyProviders(HttpServletRequest request) {
        try {
            String sessionId = getSessionId(request);
            if (sessionId == null) {
                return ResponseEntity.ok(Map.of("providers", List.of()));
            }

            List<ApiKey> keys = apiKeyRepository.findBySessionId(sessionId);
            List<String> providers = keys.stream().map(ApiKey::getProvider).toList();

            return ResponseEntity.ok(Map.of("providers", providers));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to list API key providers"));
        }
    }

    @PostMapping("/api/keys/delete")
    public ResponseEntity<Map<String, Object>> deleteApiKey(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String provider = body.get("provider");
            String sessionId = getSessionId(request);

            if (sessionId == null || provider == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Session or provider missing"));
            }

            Optional<ApiKey> apiKeyOpt = apiKeyRepository.findBySessionIdAndProvider(sessionId, provider);
            apiKeyOpt.ifPresent(apiKeyRepository::delete);

            return ResponseEntity.ok(Map.of("success", true, "message", "API key deleted"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to delete API key"));
        }
    }

    // ==================== AI API (Langchain4j) ====================

    private String callAiApi(String provider, String model, String prompt, String apiKey) throws Exception {
        ChatLanguageModel chatModel = switch (provider.toLowerCase()) {
            case "openai" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .build();
            case "claude" -> AnthropicChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .build();
            case "gemini" -> GoogleAiGeminiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .build();
            case "cohere" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .baseUrl("https://api.cohere.com/v1")
                    .build();
            case "mistral" -> MistralAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .build();
            case "deepseek" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .baseUrl("https://api.deepseek.com/v1")
                    .build();
            case "grok" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .baseUrl("https://api.x.ai/v1")
                    .build();
            case "qwen" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .baseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")
                    .build();
            case "llama" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .baseUrl("https://api.together.xyz/v1")
                    .build();
            case "copilot" -> OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .modelName(model)
                    .baseUrl("https://api.openai.com/v1")
                    .build();
            default -> throw new UnsupportedOperationException("Provider not supported: " + provider);
        };

        return chatModel.generate(prompt);
    }

    // ==================== Utility Methods ====================

    /**
     * Extracts the model name from a model identifier.
     * Format: "provider-modelName-timestamp-index-randomSuffix"
     * e.g. "openai-gpt-4o-1710000000000-0-abc12" -> "gpt-4o"
     * e.g. "claude-claude-3-5-sonnet-20241022-1710000000000-0-xyz99" ->
     * "claude-3-5-sonnet-20241022"
     *
     * Strategy: strip the provider prefix, then strip the trailing
     * timestamp (13-digit number), index (single digit), and random suffix (5
     * alphanumeric chars).
     */
    private String extractModelName(String modelIdentifier) {
        if (modelIdentifier == null || modelIdentifier.isEmpty()) {
            return modelIdentifier;
        }

        // Strip the provider prefix (everything up to and including the first hyphen)
        String provider = modelIdentifier.split("-")[0];
        String withoutProvider = modelIdentifier.substring(provider.length() + 1);

        // The suffix added by the frontend is: -<timestamp>-<index>-<random>
        // timestamp = 13+ digits, index = digit(s), random = 5 alphanumeric chars
        // Use regex to strip trailing pattern: -\d{13,}-\d+-[a-z0-9]{5}$
        String modelName = withoutProvider.replaceAll("-\\d{13,}-\\d+-[a-z0-9]{5}$", "");

        return modelName.isEmpty() ? withoutProvider : modelName;
    }

    /**
     * Extracts "provider-model" from a full model identifier for stats/leaderboard
     * grouping.
     */
    private String extractProviderAndModel(String modelIdentifier) {
        if (modelIdentifier == null)
            return "unknown";
        String provider = modelIdentifier.split("-")[0];
        String model = extractModelName(modelIdentifier);
        return provider + "/" + model;
    }

    private String getOrCreateSessionId(HttpServletRequest request, HttpServletResponse response) {
        String sessionId = getSessionId(request);
        if (sessionId == null) {
            sessionId = UUID.randomUUID().toString();
            Cookie cookie = new Cookie("sessionId", sessionId);
            cookie.setMaxAge(60 * 60 * 24 * 30); // 30 days
            cookie.setPath("/");
            cookie.setHttpOnly(true);
            response.addCookie(cookie);
        }
        return sessionId;
    }

    private String getSessionId(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("sessionId".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }

    private String encrypt(String data) throws Exception {
        SecretKeySpec key = new SecretKeySpec(padKey(encryptionKey).getBytes(), "AES");
        Cipher cipher = Cipher.getInstance("AES");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        return Base64.getEncoder().encodeToString(cipher.doFinal(data.getBytes()));
    }

    private String decrypt(String encryptedData) throws Exception {
        SecretKeySpec key = new SecretKeySpec(padKey(encryptionKey).getBytes(), "AES");
        Cipher cipher = Cipher.getInstance("AES");
        cipher.init(Cipher.DECRYPT_MODE, key);
        return new String(cipher.doFinal(Base64.getDecoder().decode(encryptedData)));
    }

    private String padKey(String key) {
        if (key.length() >= 16) {
            return key.substring(0, 16);
        }
        return String.format("%-16s", key).replace(' ', '0');
    }
}