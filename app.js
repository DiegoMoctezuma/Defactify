/**
 * ========================================================================
 *   Defactify - Premium Application JavaScript Logic
 *   Core logic for client-side routing, upload handling, simulated
 *   forensic scanning, and exportable certificate report modal.
 * ========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. STATE & CONSTANTS ---

    // URL base del backend en Hugging Face Spaces
    const API_BASE = 'https://mikitl-defacticy.hf.space';

    const STATE = {
        currentScreen: 'onboarding', // 'onboarding' | 'dashboard'
        isScanning: false,
        hasImage: false,
        analysisResult: null, // { realScore, aiScore, verdict, details }
        currentImgDataUrl: null,
        currentFilename: ''
    };

    // (Demo forensics removed — assets/real_sample.png y ai_sample.png reservados para uso futuro)

    // --- 2. DOM ELEMENTS ---
    // Navigation / Routing
    const screens = {
        onboarding: document.getElementById('screen-onboarding'),
        dashboard: document.getElementById('screen-dashboard')
    };
    const navLinks = {
        guide: document.getElementById('nav-guide-btn'),
        analyze: document.getElementById('nav-analyze-btn'),
        logo: document.getElementById('nav-logo-btn'),
        mobileGuide: document.getElementById('mobile-guide-btn'),
        mobileAnalyze: document.getElementById('mobile-analyze-btn')
    };
    const startAnalysisBtn = document.getElementById('start-analysis-btn');

    // Dashboard Interactive Elements
    const dropzone = document.getElementById('dropzone');
    const imageInput = document.getElementById('image-input');
    const previewWrapper = document.getElementById('preview-wrapper');
    const previewImg = document.getElementById('preview-img');
    const resetPreviewBtn = document.getElementById('reset-preview-btn');
    
    // Camera Integration Elements
    const uploadDefaultView = document.getElementById('upload-default-view');
    const cameraTriggerBtn = document.getElementById('camera-trigger-btn');
    const cameraStreamWrapper = document.getElementById('camera-stream-wrapper');
    const cameraVideo = document.getElementById('camera-video');
    const cameraCaptureBtn = document.getElementById('camera-capture-btn');
    const cameraCloseBtn = document.getElementById('camera-close-btn');
    let cameraStream = null;

    // Results Dashboard Elements
    const verdictChip = document.getElementById('verdict-chip');
    const verdictIcon = document.getElementById('verdict-icon');
    const verdictText = document.getElementById('verdict-text');
    
    const scoreRealVal = document.getElementById('score-real-val');
    const scoreRealFill = document.getElementById('score-real-fill');
    const scoreAiVal = document.getElementById('score-ai-val');
    const scoreAiFill = document.getElementById('score-ai-fill');
    


    // --- 3. TOAST NOTIFICATION SYSTEM ---
    const toastContainer = document.getElementById('toast-container');

    function showToast(message, type = 'info', duration = 3500) {
        const icons = { error: 'error', success: 'check_circle', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0">${icons[type] || 'info'}</span>${message}`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-hide');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        }, duration);
    }


    // --- 4. CORE NAVIGATION LOGIC ---
    function switchScreen(targetScreen) {
        if (targetScreen === STATE.currentScreen) return;

        // Slide out current screen, wait, then reveal next
        const currentEl = screens[STATE.currentScreen];
        const targetEl = screens[targetScreen];

        currentEl.style.opacity = '0';
        currentEl.style.transform = 'translateY(-12px)';

        setTimeout(() => {
            currentEl.classList.remove('active');
            
            targetEl.classList.add('active');
            // Reflow trigger
            void targetEl.offsetWidth;
            targetEl.style.opacity = '1';
            targetEl.style.transform = 'translateY(0)';
            
            STATE.currentScreen = targetScreen;
            updateNavigationUI();
        }, 250);
    }

    function updateNavigationUI() {
        const isGuide = STATE.currentScreen === 'onboarding';

        // Update Desktop Header Links
        navLinks.guide.classList.toggle('active', isGuide);
        navLinks.analyze.classList.toggle('active', !isGuide);

        // Update Mobile Bottom Nav Bar
        navLinks.mobileGuide.classList.toggle('active', isGuide);
        navLinks.mobileAnalyze.classList.toggle('active', !isGuide);
    }

    // Attach navigation event handlers
    navLinks.guide.addEventListener('click', (e) => { e.preventDefault(); switchScreen('onboarding'); });
    navLinks.analyze.addEventListener('click', (e) => { e.preventDefault(); switchScreen('dashboard'); });
    navLinks.logo.addEventListener('click', (e) => { e.preventDefault(); switchScreen('onboarding'); });
    navLinks.mobileGuide.addEventListener('click', (e) => { e.preventDefault(); switchScreen('onboarding'); });
    navLinks.mobileAnalyze.addEventListener('click', (e) => { e.preventDefault(); switchScreen('dashboard'); });
    startAnalysisBtn.addEventListener('click', () => { switchScreen('dashboard'); });


    // --- 5. INTERACTIVE UPLOADER LOGIC ---
    // Clicking dropzone triggers file selector
    dropzone.addEventListener('click', (e) => {
        // Prevent click bubbling from inside preview resets, camera streams, or webcam triggers
        if (e.target.closest('#reset-preview-btn') || 
            e.target.closest('#camera-trigger-btn') || 
            e.target.closest('#camera-stream-wrapper')) {
            return;
        }
        imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleSelectedFile(e.target.files[0]);
        }
    });

    // Drag-and-drop actions
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (STATE.isScanning) return;
        dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (STATE.isScanning) return;

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleSelectedFile(e.dataTransfer.files[0]);
        }
    });

    function handleSelectedFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Por favor, selecciona un archivo de imagen válido.', 'error');
            return;
        }

        const MAX_SIZE_MB = 10;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            showToast(`La imagen supera el límite de ${MAX_SIZE_MB} MB. Por favor selecciona una imagen más pequeña.`, 'error');
            return;
        }

        STATE.currentFilename = file.name;

        // Mostrar preview inmediatamente; enviar a API en paralelo
        const reader = new FileReader();
        reader.onload = function(event) {
            STATE.currentImgDataUrl = event.target.result;
            showImagePreview(STATE.currentImgDataUrl);
            runAnalysisWithAPI(file);
        };
        reader.readAsDataURL(file);
    }

    function showImagePreview(dataUrl) {
        previewImg.src = dataUrl;
        previewWrapper.style.display = 'flex';
        dropzone.classList.add('has-image');
        STATE.hasImage = true;
    }

    // Reset Dropzone
    resetPreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetDashboardToDefault();
    });

    function resetDashboardToDefault() {
        // Stop camera tracks if active
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraStreamWrapper.style.display = 'none';
        uploadDefaultView.style.display = 'flex';

        previewImg.src = '';
        previewWrapper.style.display = 'none';
        dropzone.classList.remove('has-image');
        imageInput.value = '';
        
        STATE.hasImage = false;
        STATE.isScanning = false;
        STATE.analysisResult = null;
        STATE.currentImgDataUrl = null;
        STATE.currentFilename = '';

        dropzone.classList.remove('scanning');
        
        // Reset results gauges
        verdictChip.className = 'verdict-chip chip-neutral';
        verdictIcon.innerText = 'analytics';
        verdictText.innerText = 'Inconcluso';
        
        scoreRealVal.innerText = '50%';
        scoreRealVal.className = 'metric-value value-neutral';
        scoreRealFill.className = 'metric-fill fill-neutral';
        scoreRealFill.style.width = '50%';
        
        scoreAiVal.innerText = '50%';
        scoreAiVal.className = 'metric-value value-neutral';
        scoreAiFill.className = 'metric-fill fill-neutral';
        scoreAiFill.style.width = '50%';

    }


    // --- 6. WEBCAM CAPTURE LOGIC ---
    cameraTriggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (STATE.isScanning) return;

        // Reset dashboard to close previews or other states
        resetDashboardToDefault();

        // Switch container view to Webcam stream
        uploadDefaultView.style.display = 'none';
        cameraStreamWrapper.style.display = 'flex';

        // Access the hardware camera (environment = cámara trasera en móvil, front en desktop)
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 640 }
            },
            audio: false
        })
        .then(stream => {
            cameraStream = stream;
            cameraVideo.srcObject = stream;
        })
        .catch(err => {
            console.error('Error al acceder a la cámara:', err);
            showToast('No se pudo acceder a la cámara. Asegúrate de otorgar permisos en el navegador o sube un archivo de imagen.', 'error');
            closeWebcamStream();
        });
    });

    cameraCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeWebcamStream();
    });

    function closeWebcamStream() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraVideo.srcObject = null;
        cameraStreamWrapper.style.display = 'none';
        uploadDefaultView.style.display = 'flex';
    }

    cameraCaptureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!cameraStream) return;

        // 1. Setup off-screen canvas to capture a square image matching the aspect-ratio
        const captureCanvas = document.createElement('canvas');
        const videoWidth = cameraVideo.videoWidth || 640;
        const videoHeight = cameraVideo.videoHeight || 640;
        
        // Use a square format centered around the video stream
        const captureSize = Math.min(videoWidth, videoHeight);
        captureCanvas.width = captureSize;
        captureCanvas.height = captureSize;

        const captureCtx = captureCanvas.getContext('2d');
        
        // Calculate offset to crop a centered square from the rectangular stream
        const sx = (videoWidth - captureSize) / 2;
        const sy = (videoHeight - captureSize) / 2;

        captureCtx.drawImage(
            cameraVideo,
            sx, sy, captureSize, captureSize, // Source square
            0, 0, captureSize, captureSize    // Destination square
        );

        // 2. Generar DataURL para preview (síncrono) y detener cámara
        const dataUrl = captureCanvas.toDataURL('image/png');
        closeWebcamStream();

        // 3. Mostrar preview inmediatamente
        STATE.currentFilename = `camara_capture_${Date.now()}.png`;
        STATE.currentImgDataUrl = dataUrl;
        showImagePreview(dataUrl);

        // 4. Convertir a Blob y enviar a la API
        captureCanvas.toBlob((blob) => {
            runAnalysisWithAPI(blob);
        }, 'image/png');
    });


    // --- 7. FORENSIC API ENGINE ---

    /**
     * Envía la imagen al endpoint /predict de FastAPI y muestra el resultado.
     * @param {File|Blob} fileOrBlob  Imagen a analizar.
     */
    async function runAnalysisWithAPI(fileOrBlob) {
        STATE.isScanning = true;
        dropzone.classList.add('scanning');

        // Estado visual de procesamiento
        verdictChip.className = 'verdict-chip chip-neutral';
        verdictIcon.innerText = 'cached';
        verdictText.innerText = 'Analizando…';

        scoreRealVal.innerText = '--';
        scoreRealVal.className = 'metric-value value-neutral';
        scoreRealFill.className = 'metric-fill fill-neutral';
        scoreRealFill.style.width = '15%';

        scoreAiVal.innerText = '--';
        scoreAiVal.className = 'metric-value value-neutral';
        scoreAiFill.className = 'metric-fill fill-neutral';
        scoreAiFill.style.width = '15%';

        const formData = new FormData();
        formData.append('file', fileOrBlob, STATE.currentFilename);

        try {
            const response = await fetch(`${API_BASE}/predict`, { method: 'POST', body: formData });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
                throw new Error(err.detail || `Error ${response.status}`);
            }

            const apiResult = await response.json();

            if (!STATE.hasImage) return; // El usuario limpió durante la petición

            dropzone.classList.remove('scanning');
            STATE.isScanning = false;

            const result = buildForensicResult(apiResult);
            STATE.analysisResult = result;
            displayAnalysisOutcome(result);

        } catch (err) {
            dropzone.classList.remove('scanning');
            STATE.isScanning = false;
            showToast(`Error al analizar la imagen: ${err.message}`, 'error');
            resetDashboardToDefault();
        }
    }

    /** Convierte la respuesta { real, ai_generated } de la API al formato de la UI. */
    function buildForensicResult(apiResult) {
        const realScore = Math.round(apiResult.real * 100);
        const aiScore   = 100 - realScore;
        const verdict   = realScore >= aiScore ? 'REAL' : 'AI';
        return { realScore, aiScore, verdict };
    }

    function displayAnalysisOutcome(result) {
        const isReal = result.verdict === 'REAL';
        
        // 1. Toggle Verdict Badge Styles
        if (isReal) {
            verdictChip.className = 'verdict-chip chip-real';
            verdictIcon.innerText = 'check_circle';
            verdictText.innerText = 'CONFIABLE - Imagen Real';
            
            scoreRealVal.innerText = `${result.realScore}%`;
            scoreRealVal.className = 'metric-value value-real';
            scoreRealFill.className = 'metric-fill fill-real';
            scoreRealFill.style.width = `${result.realScore}%`;
            
            scoreAiVal.innerText = `${result.aiScore}%`;
            scoreAiVal.className = 'metric-value value-neutral';
            scoreAiFill.className = 'metric-fill fill-neutral';
            scoreAiFill.style.width = `${result.aiScore}%`;
        } else {
            verdictChip.className = 'verdict-chip chip-ai';
            verdictIcon.innerText = 'warning';
            verdictText.innerText = 'ALERTA - Creada por IA';
            
            scoreRealVal.innerText = `${result.realScore}%`;
            scoreRealVal.className = 'metric-value value-neutral';
            scoreRealFill.className = 'metric-fill fill-neutral';
            scoreRealFill.style.width = `${result.realScore}%`;
            
            scoreAiVal.innerText = `${result.aiScore}%`;
            scoreAiVal.className = 'metric-value value-ai';
            scoreAiFill.className = 'metric-fill fill-ai';
            scoreAiFill.style.width = `${result.aiScore}%`;
        }

    }

    // --- 8. FORENSIC GRID CANVAS BACKGROUND ANIMATION ---
    const canvas = document.getElementById('bg-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let isMobile = window.innerWidth < 768;
        
        let mouseX = -1000;
        let mouseY = -1000;
        let mouseActive = false;
        let animationFrameId = null;

        // Particle System Setup
        const shapes = [];
        const shapeTypes = ['circle', 'square', 'cross', 'triangle'];
        const numShapes = isMobile ? 12 : 30;

        function initShapes() {
            shapes.length = 0;
            // High-visibility Deep Purple shades matching the brand primary colors
            const colors = [
                'rgba(92, 37, 159, 0.38)',   // Main deep purple
                'rgba(126, 34, 206, 0.42)',  // Vibrant violet-purple
                'rgba(74, 20, 140, 0.36)'    // Ultra deep purple
            ];
            for (let i = 0; i < numShapes; i++) {
                shapes.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    baseX: Math.random() * canvas.width,
                    baseY: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.25,
                    vy: (Math.random() - 0.5) * 0.25,
                    size: Math.random() * 22 + 14, // sizes between 14px and 36px (highly visible!)
                    type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
                    color: colors[Math.floor(Math.random() * colors.length)],
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.006,
                    oscTimeX: Math.random() * 100,
                    oscTimeY: Math.random() * 100,
                    oscSpeedX: 0.003 + Math.random() * 0.003,
                    oscSpeedY: 0.003 + Math.random() * 0.003,
                    oscAmplitude: Math.random() * 15 + 8
                });
            }
        }

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            isMobile = window.innerWidth < 768;
            initShapes();
            
            if (isMobile) {
                // Draw single frame once on mobile and cancel active loops to save resources
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                draw();
            } else {
                // Ensure loop runs on PC
                if (!animationFrameId) {
                    tick();
                }
            }
        }

        // Draw Single Frame function (used directly for mobile and inside loop on desktop)
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 1. Draw Forensic Grid of Dots
            const dotSpacing = isMobile ? 60 : 50;
            const cols = Math.ceil(canvas.width / dotSpacing);
            const rows = Math.ceil(canvas.height / dotSpacing);

            for (let c = 0; c <= cols; c++) {
                for (let r = 0; r <= rows; r++) {
                    let x = c * dotSpacing;
                    let y = r * dotSpacing;

                    if (!isMobile && mouseActive) {
                        const dx = mouseX - x;
                        const dy = mouseY - y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 150) {
                            const force = (150 - dist) / 150;
                            // Magnetic dot pulse (Strong purple and highly visible)
                            const alpha = force * 0.43 + 0.22;
                            ctx.fillStyle = `rgba(92, 37, 159, ${alpha})`;
                            x -= (dx / dist) * force * 6;
                            y -= (dy / dist) * force * 6;
                        } else {
                            ctx.fillStyle = 'rgba(92, 37, 159, 0.22)';
                        }
                    } else {
                        ctx.fillStyle = 'rgba(92, 37, 159, 0.22)';
                    }

                    ctx.beginPath();
                    ctx.arc(x, y, 1.8, 0, Math.PI * 2); // Increased dot radius to 1.8px for extra strength
                    ctx.fill();
                }
            }

            // 2. Draw Floating Geometric Particles
            shapes.forEach(shape => {
                ctx.strokeStyle = shape.color;
                ctx.lineWidth = 2.2; // Thicker stroke for outstanding definitions
                
                ctx.save();
                ctx.translate(shape.x, shape.y);
                ctx.rotate(shape.rotation);
                
                ctx.beginPath();
                if (shape.type === 'circle') {
                    ctx.arc(0, 0, shape.size / 2, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (shape.type === 'square') {
                    ctx.strokeRect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
                } else if (shape.type === 'cross') {
                    ctx.moveTo(-shape.size / 2, 0);
                    ctx.lineTo(shape.size / 2, 0);
                    ctx.moveTo(0, -shape.size / 2);
                    ctx.lineTo(0, shape.size / 2);
                    ctx.stroke();
                } else if (shape.type === 'triangle') {
                    ctx.moveTo(0, -shape.size / 2);
                    ctx.lineTo(shape.size / 2, shape.size / 2);
                    ctx.lineTo(-shape.size / 2, shape.size / 2);
                    ctx.closePath();
                    ctx.stroke();
                }
                
                ctx.restore();
            });
        }

        // Desktop Physics Animation Frame Tick
        function tick() {
            // Float shapes
            shapes.forEach(shape => {
                shape.baseX += shape.vx;
                shape.baseY += shape.vy;

                // Screen boundary wrap around
                if (shape.baseX < -50) shape.baseX = canvas.width + 50;
                if (shape.baseX > canvas.width + 50) shape.baseX = -50;
                if (shape.baseY < -50) shape.baseY = canvas.height + 50;
                if (shape.baseY > canvas.height + 50) shape.baseY = -50;

                // Apply sinusoidal natural floating
                shape.oscTimeX += shape.oscSpeedX;
                shape.oscTimeY += shape.oscSpeedY;
                
                let targetX = shape.baseX + Math.sin(shape.oscTimeX) * shape.oscAmplitude;
                let targetY = shape.baseY + Math.cos(shape.oscTimeY) * shape.oscAmplitude;

                // PC Mouse interaction: Repulsion physics
                if (mouseActive) {
                    const dx = mouseX - targetX;
                    const dy = mouseY - targetY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const repulsionRadius = 180;
                    
                    if (dist < repulsionRadius) {
                        const force = (repulsionRadius - dist) / repulsionRadius;
                        // Move target away from mouse based on proximity
                        targetX -= (dx / dist) * force * 45;
                        targetY -= (dy / dist) * force * 45;
                    }
                }

                // Smooth linear interpolation (lerp) for organic physical movement
                shape.x += (targetX - shape.x) * 0.06;
                shape.y += (targetY - shape.y) * 0.06;
                shape.rotation += shape.rotationSpeed;
            });

            draw();
            animationFrameId = requestAnimationFrame(tick);
        }

        // Mouse listeners for PC
        window.addEventListener('mousemove', (e) => {
            if (isMobile) return;
            mouseX = e.clientX;
            mouseY = e.clientY;
            mouseActive = true;
        });

        window.addEventListener('mouseleave', () => {
            mouseActive = false;
        });

        window.addEventListener('resize', resizeCanvas);

        // Initialize Canvas Size & Shapes
        resizeCanvas();
    }

});
