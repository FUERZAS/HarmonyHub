// CREPE (Magenta.js) - based pitch detector using TensorFlow.js
// Note: this requires the magenta.js script included in the page.
(async function() {
  const startBtn = document.getElementById('start-pitch');
  const stopBtn = document.getElementById('stop-pitch');
  const detectedNoteEl = document.getElementById('detected-note');
  const detectedFreqEl = document.getElementById('detected-freq');
  const pitchMeterEl = document.getElementById('pitch-meter');
  const pitchCentsEl = document.getElementById('pitch-cents');
  const targetSelect = document.getElementById('target-note');
  const modelStatusEl = document.getElementById('model-status');
  const forceFallbackCheckbox = document.getElementById('force-fallback');
  const toleranceSlider = document.getElementById('tolerance-slider');
  const toleranceValueEl = document.getElementById('tolerance-value');

  let audioCtx = null;
  let mediaStream = null;
  let processor = null;
  let magentaPitchDetector = null;
  let running = false;
  let guideOsc = null;
  let guideGain = null;
  let guideBufferSource = null;
  let guideSampleBuffer = null;
  let countdownTimer = null;

  const playGuideBtn = document.getElementById('play-guide');
  const stopGuideBtn = document.getElementById('stop-guide');
  const guideVolume = document.getElementById('guide-volume');
  const guideMode = document.getElementById('guide-mode');
  const guideSampleFile = document.getElementById('guide-sample-file');
  const guideCountdownEl = document.getElementById('guide-countdown');

  // Helper: convert frequency to MIDI and note
  function freqToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }
  function midiToNoteName(m) {
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const midi = Math.round(m);
    const name = noteNames[(midi % 12 + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return name + octave;
  }

  // Convert note name like A4 -> frequency (Hz)
  function noteNameToFreq(noteName) {
    const m = noteName.match(/^([A-G]#?)(-?\d+)$/);
    if (!m) return 440;
    const name = m[1];
    const octave = parseInt(m[2], 10);
    const noteNames = { 'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11 };
    const midi = (octave + 1) * 12 + noteNames[name];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Compute cents difference between frequency and target frequency
  function centsDiff(freq, targetFreq) {
    if (freq <= 0 || targetFreq <= 0) return 1e6;
    return 1200 * Math.log2(freq / targetFreq);
  }

  function setOnPitchVisual(cents) {
    const tol = parseFloat(toleranceSlider ? toleranceSlider.value : 20);
    // Coloring: green within tolerance, yellow within 2x, red otherwise
    if (typeof window.__onPitchConfirm === 'undefined') window.__onPitchConfirm = { count: 0, threshold: 3, lastState: false };
    const conf = window.__onPitchConfirm;
    const within = Math.abs(cents) <= tol;
    if (within) {
      conf.count++;
    } else {
      conf.count = 0;
    }
    const confirmed = conf.count >= conf.threshold;
    // Only change to 'green' (confirmed on-pitch) when confirmed; allow yellow/red immediate feedback
    if (confirmed) {
      pitchMeterEl.style.background = '#6ee7b7'; // green
      pitchCentsEl.style.color = '#1f7a3a';
    } else if (Math.abs(cents) <= tol * 2) {
      pitchMeterEl.style.background = '#facc15'; // yellow
      pitchCentsEl.style.color = '#806000';
    } else {
      pitchMeterEl.style.background = '#ff6b6b'; // red
      pitchCentsEl.style.color = '#7a1f1f';
    }
    // remember state
    conf.lastState = confirmed;
  }

  // Initialize Magenta PitchDetector (CREPE)
  async function ensureDetector() {
    if (magentaPitchDetector) return magentaPitchDetector;
    if (!window.mm || !window.mm.PitchDetector) {
      throw new Error('Magenta PitchDetector not found. Ensure magenta.js is loaded.');
    }
    // Wait for TF to be ready if available
    if (window.tf && typeof window.tf.ready === 'function') {
      try {
        await window.tf.ready();
      } catch (e) {
        console.warn('tf.ready() failed or timed out', e);
      }
    }
    // modelUrl undefined will load default crepe model packaged in magenta
    magentaPitchDetector = await window.mm.PitchDetector.create();
    return magentaPitchDetector;
  }

  async function start() {
    if (running) return;

    let useFallback = false;
    // If user forces fallback, don't try to load CREPE
    if (forceFallbackCheckbox && forceFallbackCheckbox.checked) {
      useFallback = true;
      if (modelStatusEl) modelStatusEl.textContent = 'Model: Using fallback (forced)';
    } else {
      if (modelStatusEl) modelStatusEl.textContent = 'Model: Loading...';
      try {
        await ensureDetector();
        if (modelStatusEl) modelStatusEl.textContent = 'Model: CREPE loaded';
      } catch (e) {
        console.warn('CREPE model load failed, falling back to autocorrelation detector:', e);
        useFallback = true;
        if (modelStatusEl) modelStatusEl.textContent = 'Model: Using fallback (load failed)';
      }
    }

    // Pre-check: ensure getUserMedia is available
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.error('getUserMedia not supported in this browser');
      Swal.fire('Microphone Error', 'Your browser does not support microphone access (getUserMedia). Try a modern browser (Chrome, Firefox, or Safari) or update your browser.', 'error');
      return;
    }

    // Warn when not in secure context (required on many mobile browsers)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      console.warn('Insecure context: getUserMedia may be blocked. Current protocol:', location.protocol);
      // show a gentle warning but still attempt to request access
      // Users on mobile typically need HTTPS for microphone permissions
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone access error', err);
      // Provide a more specific message depending on the error
      let userMsg = 'Unable to access microphone. Please allow microphone access and try again.';
      if (err && err.name) {
        // Common errors: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError
        userMsg += `\nError: ${err.name}${err.message ? ' - ' + err.message : ''}`;
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          userMsg += '\nTip: Check site permissions in your browser settings and ensure microphone access is allowed for this site.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          userMsg += '\nTip: No microphone was found. Ensure your device has a microphone and it is not in use by another app.';
        }
      }
      // Show the full message in an alert so mobile users can read guidance
      Swal.fire({ title: 'Microphone Error', text: userMsg, icon: 'error', confirmButtonText: 'OK', width: 'auto' });
      return;
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);

  if (!useFallback) {
      // CREPE via Magenta (higher accuracy)
      const bufferSize = 2048;
      processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      processor.onaudioprocess = async (evt) => {
        const input = evt.inputBuffer.getChannelData(0);
        const inputCopy = new Float32Array(input.length);
        inputCopy.set(input);
        try {
          const result = await magentaPitchDetector.getPitch(inputCopy, audioCtx.sampleRate);
          if (result && result.frequency && result.confidence > 0.5) {
            const freq = result.frequency;
            const midi = freqToMidi(freq);
            const roundedMidi = Math.round(midi);
            const cents = Math.round((midi - roundedMidi) * 100);
            const noteName = midiToNoteName(roundedMidi);
              // compute distance to selected target note
              const targetNote = targetSelect ? targetSelect.value : 'A4';
              const targetFreq = noteNameToFreq(targetNote);
              const centsToTarget = Math.round(centsDiff(freq, targetFreq));

              detectedNoteEl.textContent = noteName;
              detectedFreqEl.textContent = `Freq: ${freq.toFixed(2)} Hz`;
              pitchCentsEl.textContent = `${centsToTarget >= 0 ? '+' : ''}${centsToTarget} c`;
              const pct = Math.max(0, Math.min(100, 50 + (centsToTarget)));
              pitchMeterEl.style.width = pct + '%';
              setOnPitchVisual(centsToTarget);
          } else {
            detectedNoteEl.textContent = '--';
            detectedFreqEl.textContent = 'Freq: -- Hz';
            pitchCentsEl.textContent = '±0 c';
            pitchMeterEl.style.width = '0%';
          }
        } catch (err) {
          // if CREPE starts throwing, fallback to autocorrelation
          console.warn('CREPE getPitch failed, switching to fallback:', err);
          useFallback = true;
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      running = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      return;
    }

    // Fallback: autocorrelation method (lighter and robust for solo voice)
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);

    const autoCorrelate = (buffer, sampleRate) => {
      let SIZE = buffer.length;
      let rms = 0;
      for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
      }
      rms = Math.sqrt(rms / SIZE);
      if (rms < 0.01) return { freq: -1, rms };

      let r1 = 0, r2 = SIZE - 1;
      const thres = 0.2;
      for (let i = 0; i < SIZE/2; i++) {
        if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
      }
      for (let i = 1; i < SIZE/2; i++) {
        if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
      }
      let slice = buffer.slice(r1, r2);
      SIZE = slice.length;

      const c = new Array(SIZE).fill(0);
      for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
          c[i] = c[i] + slice[j] * slice[j + i];
        }
      }
      let d = 0;
      while (c[d] > c[d + 1]) d++;
      let maxval = -1, maxpos = -1;
      for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
      }
      let T0 = maxpos;
      if (!T0) return { freq: -1, rms };
      const x1 = c[T0-1], x2 = c[T0], x3 = c[T0+1];
      const a = (x1 + x3 - 2*x2) / 2;
      const b = (x3 - x1) / 2;
      if (a) T0 = T0 - b / (2*a);
      const freq = sampleRate / T0;
      return { freq, rms };
    };

    function fallbackLoop() {
      analyser.getFloatTimeDomainData(buf);
      const { freq, rms } = autoCorrelate(buf, audioCtx.sampleRate);
      if (freq > 0) {
        const midi = freqToMidi(freq);
        const roundedMidi = Math.round(midi);
        const cents = Math.round((midi - roundedMidi) * 100);
        const noteName = midiToNoteName(roundedMidi);
        const targetNote = targetSelect ? targetSelect.value : 'A4';
        const targetFreq = noteNameToFreq(targetNote);
        const centsToTarget = Math.round(centsDiff(freq, targetFreq));

        detectedNoteEl.textContent = noteName;
        detectedFreqEl.textContent = `Freq: ${freq.toFixed(2)} Hz`;
        pitchCentsEl.textContent = `${centsToTarget >= 0 ? '+' : ''}${centsToTarget} c`;
        const pct = Math.max(0, Math.min(100, 50 + (centsToTarget)));
        pitchMeterEl.style.width = pct + '%';
        setOnPitchVisual(centsToTarget);
      } else {
        detectedNoteEl.textContent = '--';
        detectedFreqEl.textContent = 'Freq: -- Hz';
        pitchCentsEl.textContent = '±0 c';
        pitchMeterEl.style.width = '0%';
      }
      // continue loop
      requestAnimationFrame(fallbackLoop);
    }

    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    if (modelStatusEl && useFallback) modelStatusEl.textContent = 'Model: Using fallback (autocorrelation)';
    requestAnimationFrame(fallbackLoop);
  }

  // Audio guide: play a sine tone at the selected target frequency
  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playGuide() {
    // Start after a 3..2..1 countdown to give user time to prepare
    const startPlayback = async () => {
      try {
        const ctx = ensureAudioCtx();
        const mode = guideMode ? guideMode.value : 'sine';
        const vol = guideVolume ? parseFloat(guideVolume.value) : 0.6;

        if (mode === 'sample' && guideSampleBuffer) {
          guideBufferSource = ctx.createBufferSource();
          guideBufferSource.buffer = guideSampleBuffer;
          guideGain = ctx.createGain();
          guideGain.gain.value = vol;
          guideBufferSource.connect(guideGain);
          guideGain.connect(ctx.destination);
          guideBufferSource.start();
        } else if (mode === 'arpeggio') {
          // simple arpeggio across a triad starting at target
          const targetNote = targetSelect ? targetSelect.value : 'A4';
          const rootFreq = noteNameToFreq(targetNote);
          const tri = [0, 4, 7]; // major triad intervals
          let offset = 0;
          tri.forEach((interval) => {
            const osc = ctx.createOscillator();
            const freq = rootFreq * Math.pow(2, interval / 12);
            const g = ctx.createGain();
            g.gain.value = 0;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + offset);
            osc.connect(g);
            g.connect(ctx.destination);
            // envelope
            g.gain.setValueAtTime(0, ctx.currentTime + offset);
            g.gain.linearRampToValueAtTime(vol, ctx.currentTime + offset + 0.02);
            g.gain.linearRampToValueAtTime(0, ctx.currentTime + offset + 0.6);
            osc.start(ctx.currentTime + offset);
            osc.stop(ctx.currentTime + offset + 0.62);
            offset += 0.65;
          });
        } else {
          // continuous sine tone
          const targetNote = targetSelect ? targetSelect.value : 'A4';
          const freq = noteNameToFreq(targetNote);
          guideOsc = ctx.createOscillator();
          guideOsc.type = 'sine';
          guideOsc.frequency.value = freq;
          guideGain = ctx.createGain();
          guideGain.gain.value = vol;
          guideOsc.connect(guideGain);
          guideGain.connect(ctx.destination);
          guideOsc.start();
        }
        if (playGuideBtn) playGuideBtn.disabled = true;
        if (stopGuideBtn) stopGuideBtn.disabled = false;
      } catch (e) {
        console.warn('Error playing guide', e);
      }
    };

    // countdown 3..2..1
    let count = 3;
    if (guideCountdownEl) guideCountdownEl.textContent = count;
    countdownTimer = setInterval(() => {
      count--;
      if (guideCountdownEl) guideCountdownEl.textContent = count > 0 ? count : '';
      if (count <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        if (guideCountdownEl) guideCountdownEl.textContent = '';
        startPlayback();
      }
    }, 1000);
  }

  function stopGuide() {
    try {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        if (guideCountdownEl) guideCountdownEl.textContent = '';
      }
      if (guideBufferSource) {
        try { guideBufferSource.stop(); } catch (e) {}
        guideBufferSource.disconnect();
        guideBufferSource = null;
      }
      if (guideOsc) {
        guideOsc.stop();
        guideOsc.disconnect();
        guideOsc = null;
      }
      if (guideGain) {
        guideGain.disconnect();
        guideGain = null;
      }
    } catch (e) {
      console.warn('Error stopping guide tone', e);
    }
    if (playGuideBtn) playGuideBtn.disabled = false;
    if (stopGuideBtn) stopGuideBtn.disabled = true;
  }

  // handle sample file selection and decoding
  if (guideSampleFile) {
    guideSampleFile.addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const arr = await f.arrayBuffer();
      try {
        const ctx = ensureAudioCtx();
        guideSampleBuffer = await ctx.decodeAudioData(arr.slice(0));
        console.log('Guide sample loaded', guideSampleBuffer);
      } catch (e) {
        console.warn('Failed to decode guide sample', e);
      }
    });
  }

  function stop() {
    if (!running) return;
    running = false;
    try {
      if (processor) {
        processor.disconnect();
        processor.onaudioprocess = null;
        processor = null;
      }
      if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
    } catch (e) {
      console.warn('Error stopping audio', e);
    }
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  if (playGuideBtn) playGuideBtn.addEventListener('click', playGuide);
  if (stopGuideBtn) stopGuideBtn.addEventListener('click', stopGuide);
  if (guideVolume) guideVolume.addEventListener('input', () => {
    if (guideGain) guideGain.gain.value = parseFloat(guideVolume.value);
  });

})();
