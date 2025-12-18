import { useState, useEffect } from 'react'
import './App.css'
import ChatInstance from './ChatInstance'

// Import all SVG files from assets folder
const iconModules = import.meta.glob('./assets/*.svg', { eager: true })

// Create icons array from imported SVGs
const icons = Object.entries(iconModules).map(([path, module]) => {
  const fileName = path.split('/').pop().replace('.svg', '')
  return {
    path: module.default,
    name: fileName
  }
})

// Function to fetch available models for a provider
const fetchProviderModels = async (providerName) => {
  try {
    const response = await fetch('/api/models/provider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: providerName })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
};

// Function to save API key to server
const saveProviderApiKey = async (provider, apiKey) => {
  try {
    const response = await fetch('/api/keys/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, apiKey })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving API key:', error);
    return { success: false, error: error.message };
  }
};

// Function to fetch provider API key from server
const fetchProviderApiKey = async (provider) => {
  try {
    const response = await fetch('/api/keys/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    return data.apiKey || null;
  } catch (error) {
    console.error('Error fetching API key:', error);
    return null;
  }
};

const getProviderURL = (providerName) => {
  switch (providerName.toLowerCase()) {
    case "openai"://works
      return "https://chatgpt.com/c/?prompt=";
    case "claude":
      return "https://claude.ai/new?q=";
    case "cohere":
      return "https://dashboard.cohere.com/playground/chat?q=";
    case "copilot":
      return "https://copilot.microsoft.com/?q=";
    case "deepseek":
      return "https://chat.deepseek.com/?q=";
    case "gemini"://works
      return "https://aistudio.google.com/prompts/new_chat?prompt=";
    case "grok"://works
      return "https://grok.com/?q=";
    case "llama"://will not work
      return "https://llama.online/chat#";
    case "mistral":/// can't check - don't want to give them info
      return "https://console.mistral.ai/build/playground?from=agents#";
    case "qwen"://works
      return "https://chat.qwen.ai/?text=";
    default:
      throw new Error(`Unsupported provider: ${providerName}`);
  }
};

function App() {
  const [hasConsented, setHasConsented] = useState(false)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [masterPrompt, setMasterPrompt] = useState('')
  const [activeModels, setActiveModels] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  const [triggerSend, setTriggerSend] = useState(0)

  // Modal states
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [availableModels, setAvailableModels] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [selectedModel, setSelectedModel] = useState(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [instanceCount, setInstanceCount] = useState(1) // Number of instances to add

  // Load consent
  useEffect(() => {
    const consent = localStorage.getItem('apiKeyConsent')
    if (consent === 'true') {
      setHasConsented(true)
    } else {
      setShowConsentModal(true)
    }
  }, [])

  // Load active models from localStorage
  useEffect(() => {
    const savedModels = JSON.parse(localStorage.getItem('activeModels') || '[]');
    if (savedModels.length > 0) {
      setActiveModels(savedModels);
    }
  }, []);

  // --- FIX START: Improved API Key Loading Logic ---
  useEffect(() => {
    const loadKeysForModels = async () => {
      if (!activeModels || activeModels.length === 0) return;

      // Filter to find only models that are missing their keys
      const modelsNeedingKeys = activeModels.filter(m => !m.encryptedApiKey);
      
      // CRITICAL FIX: If no models need keys, STOP here to prevent infinite loop
      if (modelsNeedingKeys.length === 0) return;

      // Only fetch for the specific models that need it
      const updatedKeys = await Promise.all(
        modelsNeedingKeys.map(async (model) => {
          const apiKey = await fetchProviderApiKey(model.provider);
          return { id: model.id, key: apiKey };
        })
      );

      // Create a map for easy lookup
      const keyMap = new Map(updatedKeys.map(k => [k.id, k.key]));

      // Update state functionally based on previous state
      setActiveModels(prevModels => {
        return prevModels.map(model => {
          if (keyMap.has(model.id)) {
            return { ...model, encryptedApiKey: keyMap.get(model.id) };
          }
          return model;
        });
      });
    };

    if (hasConsented) {
      loadKeysForModels();
    }
  }, [hasConsented, activeModels]); 
  // --- FIX END ---

  // Consent handlers
  const handleConsent = () => {
    localStorage.setItem('apiKeyConsent', 'true')
    setHasConsented(true)
    setShowConsentModal(false)
  }

  const handleReject = () => {
    localStorage.removeItem('apiKeyConsent')
    window.location.reload()
  }

  // Master input
  const handleMasterPromptChange = (e) => {
    const value = e.target.value
    setMasterPrompt(value)
    if (value.trim() && !isStarted) setIsStarted(true)
  }

  const handleSendMasterPrompt = () => {
    if (masterPrompt.trim()) {
      if (!isStarted) setIsStarted(true)
      setTriggerSend(prev => prev + 1)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSendMasterPrompt()
    }
  }

  // Add model modal
  const handleAddModel = () => setShowAddModal(true)
  const handleCloseAddModal = () => {
    setShowAddModal(false)
    setSelectedProvider(null)
    setAvailableModels([])
    setSelectedModel(null)
    setApiKeyInput('')
    setSaveMessage('')
    setInstanceCount(1)
  }

  const handleIconSelect = async (iconName) => {
    setSelectedProvider(iconName)
    setSelectedModel(null)
    setApiKeyInput('')
    setSaveMessage('')
    setLoadingModels(true)

    const models = await fetchProviderModels(iconName)
    setAvailableModels(models)
    setLoadingModels(false)
  }

  const handleModelSelect = (model) => {
    setSelectedModel(model)
    setApiKeyInput('')
    setSaveMessage('')
  }

  // Save API key and add model(s)
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setSaveMessage('❌ Please enter an API key')
      return
    }
    if (!selectedModel || !selectedProvider) {
      setSaveMessage('❌ Please select a model')
      return
    }

    setSavingApiKey(true)
    setSaveMessage('⏳ Saving...')

    const saveResult = await saveProviderApiKey(selectedProvider, apiKeyInput)
    if (!saveResult.success) {
      setSaveMessage(`❌ Failed to save: ${saveResult.error}`)
      setSavingApiKey(false)
      return
    }

    const modelName = typeof selectedModel === 'string' ? selectedModel : selectedModel.name

    const newModels = Array.from({ length: instanceCount }, (_, i) => ({
      // Added random suffix to prevent ID collision in fast loops
      id: `${selectedProvider}-${modelName}-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      name: modelName,
      provider: selectedProvider,
      icon: icons.find(i => i.name === selectedProvider)?.path || '',
      url: getProviderURL(selectedProvider),
      encryptedApiKey: apiKeyInput // We set this immediately so the user can chat without reloading
    }));

    // Use functional update to ensure we don't lose state
    setActiveModels(prevModels => {
        const updated = [...prevModels, ...newModels];
        localStorage.setItem('activeModels', JSON.stringify(updated));
        return updated;
    })

    setSaveMessage('✓ Model(s) added successfully!')
    setSavingApiKey(false)

    setTimeout(() => {
      setApiKeyInput('')
      setSelectedModel(null)
      setSaveMessage('')
      setInstanceCount(1)
    }, 1500)
  }

  // Render
  if (showConsentModal) {
    return (
      <div className="consentOverlay">
        <div className="consentModal">
          <h2>🔒 Data Storage Consent</h2>
          <div className="consentContent">
            <p><strong>This application needs to store encrypted API keys in your browser.</strong></p>
            <p>We will store:</p>
            <ul>
              <li>✓ Encrypted API keys for AI models</li>
              <li>✓ Your chatbot preferences</li>
              <li>✓ Session data</li>
            </ul>
            <p><strong>Your data:</strong></p>
            <ul>
              <li>• Is encrypted before storage</li>
              <li>• Always leaves local device encrypted</li>
              <li>• Isn't stored on the server database</li>
              <li>• Is decrypted only before LM api call</li>
              <li>• Can be cleared anytime</li>
            </ul>
            <p className="warningText">⚠️ We use browser localStorage. This is required for the app to function.</p>
          </div>
          <div className="consentButtons">
            <button className="consentButton acceptButton" onClick={handleConsent}>✓ I Accept</button>
            <button className="consentButton rejectButton" onClick={handleReject}>✕ Reject & Reload</button>
          </div>
        </div>
      </div>
    )
  }

  if (!hasConsented) return null

  return (
    <div className="app">
      <div className="welcomeScreen" style={{ display: isStarted ? 'none' : 'flex' }}>
        <h1 className="welcomeTitle">Ready when you are.</h1>
        <div className="iconGrid">
          {icons.slice(0, 10).map((icon, index) => (
            <div key={index} className="iconWrapper">
              <img src={icon.path} alt={icon.name} className="modelIcon" />
            </div>
          ))}
        </div>
      </div>

      <div className="chatGrid" style={{ display: isStarted ? 'flex' : 'none' }}>
        {activeModels.length === 0 ? (
          <div className="noModelsMessage">
            <h2>Add your favourite models using the '+' button on the right of the master input</h2>
          </div>
        ) : (
          activeModels.map((model) => (
            <div className="Chats" key={model.id}>
              <ChatInstance
                modelName={model.name}
                modelIcon={model.icon}
                modelIdentifier={model.id}
                modelUrl={model.url}
                masterPrompt={masterPrompt}
                provider={model.provider}
                encryptedApiKey={model.encryptedApiKey}
                hideInputFooter={triggerSend > 0}
                triggerSend={triggerSend}
              />
            </div>
          ))
        )}
      </div>

      <div className="masterInputContainer" style={{ display: (triggerSend > 0 && activeModels.length !== 0) ? 'none' : 'flex' }}>
        <input
          className="masterInput"
          value={masterPrompt}
          onChange={handleMasterPromptChange}
          onKeyDown={handleKeyPress}
          placeholder="This is the master input. Type your message..."
          autoComplete='off'
        />
        <button className="masterAddButton" onClick={handleAddModel} title="Add custom model">+</button>
      </div>

      {showAddModal && (
        <div className="modalOverlay" onClick={handleCloseAddModal}>
          <div className="addModal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Custom Chatbot Instance</h2>
            <div className="modalContentGrid">
              <div className="modalLeftColumn">
                <div className="iconSelectorGrid">
                  {icons.map((icon) => (
                    <div
                      key={icon.name}
                      className={`iconSelectItem ${selectedProvider === icon.name ? 'selected' : ''}`}
                      onClick={() => handleIconSelect(icon.name)}
                    >
                      <img src={icon.path} alt={icon.name} className="modelIconLarge" />
                      <p>{icon.name}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modalRightColumn">
                <h3>⚙️ Available Models:</h3>
                <div className="modalWIP">
                  {loadingModels ? (
                    <p className="loadingText">Loading models...</p>
                  ) : selectedProvider ? (
                    availableModels.length > 0 ? (
                      <ul className="modelsList">
                        {availableModels.map((model, index) => {
                          const modelName = typeof model === 'string' ? model : model.name
                          const isSelected = selectedModel &&
                            (typeof selectedModel === 'string' ? selectedModel : selectedModel.name) === modelName
                          return (
                            <li
                              key={index}
                              className={`modelItem ${isSelected ? 'selectedModel' : ''}`}
                              onClick={() => handleModelSelect(model)}
                            >
                              {modelName}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="emptyText">No models available for {selectedProvider}</p>
                    )
                  ) : (
                    <p className="emptyText">← Select a provider to view available models</p>
                  )}
                </div>

                <div className="apiKeySection">
                  <h3>🔑 API Key:</h3>
                  <input
                    type="password"
                    className="apiKeyInput"
                    placeholder="Enter your API key..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    disabled={savingApiKey}
                    autoComplete='off'
                  />
                  <button
                    className="saveKeyButton"
                    onClick={handleSaveApiKey}
                    disabled={savingApiKey || !apiKeyInput.trim()}
                  >
                    {savingApiKey ? 'Saving...' : 'Save & Add Model(s)'}
                  </button>
                  {saveMessage && (
                    <p className={`saveMessage ${saveMessage.includes('✓') ? 'success' : 'error'}`}>
                      {saveMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button className="closeModalButton" onClick={handleCloseAddModal}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App