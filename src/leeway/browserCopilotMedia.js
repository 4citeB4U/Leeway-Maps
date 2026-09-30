// Browser-only recognition adapter derived from the LeeWay Live media contract.
// It requests no microphone until a person presses the Talk control.
export class BrowserCopilotMedia {
  constructor(onEvidence = () => {}) {
    this.onEvidence = onEvidence;
    this.recognition = null;
  }

  supportsRecognition() {
    return Boolean(
      globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
    );
  }

  startRecognition({ onInterim, onFinal, onError, onEnd, language } = {}) {
    const Recognition =
      globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition)
      throw new Error(
        'Browser speech recognition is unavailable. Type your request instead.',
      );
    this.stopRecognition();
    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language || navigator.language || 'en-US';
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const transcript = String(event.results[index][0]?.transcript || '');
        if (event.results[index].isFinal) final += transcript;
        else interim += transcript;
      }
      if (interim) onInterim?.(interim.trim());
      if (final) onFinal?.(final.trim());
    };
    recognition.onerror = (event) => {
      if (this.recognition === recognition)
        onError?.(new Error(event.error || 'speech recognition failed'));
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      onEnd?.();
    };
    recognition.start();
    this.onEvidence('BROWSER_PUSH_TO_TALK_STARTED');
  }

  stopRecognition() {
    const recognition = this.recognition;
    this.recognition = null;
    try {
      recognition?.abort();
    } catch {}
    if (recognition) this.onEvidence('BROWSER_PUSH_TO_TALK_STOPPED');
  }
}
