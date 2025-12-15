import { useState, useEffect } from 'react'
import './ChatInstance.css'

function ChatInstance({ 
  modelName = "AI Model", 
  modelIcon = "", 
  modelIdentifier = "model-1",
  modelUrl = "#",
  masterPrompt = "",
  provider = "",
  encryptedApiKey = "",
  hideInputFooter = false,
  triggerSend = 0,
  onWinnerSelected = null
}) {
  const [userPrompt, setUserPrompt] = useState(masterPrompt)
  const [aiResponse, setAiResponse] = useState("")
  const [isInputHidden, setIsInputHidden] = useState(hideInputFooter)
  const [showButtons, setShowButtons] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

    useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const res = await fetch('/api/keys/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.apiKey) setEncryptedApiKey(data.apiKey)
        }
      } catch (err) {
        console.error("Failed to load API key:", err)
      }
    }
    fetchApiKey()
  }, [provider])

  // Update prompt when masterPrompt changes
  useEffect(() => {
    setUserPrompt(masterPrompt)
  }, [masterPrompt])

  // Trigger send when triggerSend changes
  useEffect(() => {
    if (triggerSend > 0) handleSend()
  }, [triggerSend])

  const handleSend = async () => {
    if (!userPrompt.trim()) return
    if (!encryptedApiKey) {
      setAiResponse("API key missing. Please add it first.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          modelIdentifier,
          prompt: userPrompt,
          encryptedApiKey
        })
      })

      const data = await response.json()
      if (!response.ok) {
        setAiResponse(data.error || "No reply received.")
      } else {
        setAiResponse(data.reply || "No response from AI")
      }

    } catch (err) {
      setError(err.message || "Failed to get AI response")
      setAiResponse(`Error: ${err.message || "Could not reach server"}`)
    } finally {
      setIsLoading(false)
      setIsInputHidden(true)
      setShowButtons(true)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSelectWinner = async () => {
    try {
      // POST to mark this as winner
      await fetch('/api/select-winner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          modelIdentifier: modelIdentifier,
          prompt: userPrompt,
          response: aiResponse
        })
      })
      
      // Load target website with prompt + reply
      const targetUrl = new URL(modelUrl)
      targetUrl.searchParams.append('prompt', "Prompt:" + userPrompt)
      targetUrl.searchParams.append('reply', "Reply:" + aiResponse + "Await further instructions. If you understood, reply with \"Let's keep things going\".")
      
      // Open in new tab
      window.open(targetUrl.toString(), '_blank')
      
      // Callback to parent if provided
      if (onWinnerSelected) {
        onWinnerSelected({
          modelIdentifier,
          modelName,
          prompt: userPrompt,
          response: aiResponse
        })
      }
      
    } catch (err) {
      console.error('Failed to select winner:', err)
      alert('Failed to process winner selection')
    }
    finally {
      // Reload current page after short delay - always executes
      setTimeout(() => {
        window.location.reload()
      }, 500)
    }
  }

  const handleDismiss = () => {
    // Hide this AI instance
    const container = document.querySelector(`[data-model="${modelIdentifier}"]`)
    if (container) {
      container.style.display = 'none'
    } else {
      // Fallback: hide nearest container
      const element = document.querySelector('.chatContainer')
      if (element) element.style.display = 'none'
    }
  }

  const handleIconClick = () => {
    if (modelUrl && modelUrl !== '#') {
      window.open(modelUrl, '_blank')
    }
  }

  return (
    <div className="chatContainer" data-model={modelIdentifier}>
      <div className="chatHeader">
        <span className="chatbotName">{modelName}</span>
        <button 
          className="chatbotIcon" 
          onClick={handleIconClick}
          disabled={!modelUrl || modelUrl === '#'}
        >
          {modelIcon && <img src={modelIcon} alt={`${modelName} icon`} className="iconImage" />}
        </button>
      </div>

      <div className="chatMessages">
        {userPrompt && (
          <div className="message userMessage">{userPrompt}</div>
        )}
        {isLoading && (
          <div className="message botMessage loadingMessage">
            <span className="loadingDots">Thinking</span>
          </div>
        )}
        {aiResponse && !isLoading && (
          <div className="message botMessage">{aiResponse}</div>
        )}
        {error && !aiResponse && (
          <div className="message botMessage errorMessage">
            ⚠️ {error}
          </div>
        )}
      </div>

      {!isInputHidden && (
        <div className="chatInputWrapper">
          <input 
            className="chatTextInput" 
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Enter your prompt..."
            disabled={isLoading}
          />
          <button 
            className="sendButton" 
            onClick={handleSend}
            disabled={isLoading || !userPrompt.trim()}
            title="Send to AI"
          >
            ➤
          </button>
        </div>
      )}

      {showButtons && (
        <div className="chatInputWrapper">
          <button 
            className="actionButton crownButton" 
            onClick={handleSelectWinner}
            title="Pick this as winner"
          >
            👑 Winner
          </button>
          <button 
            className="actionButton crossButton" 
            onClick={handleDismiss}
            title="Dismiss this response"
          >
            ✕ Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

export default ChatInstance