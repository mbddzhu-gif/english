class InputManager {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvasElement = null;
    }

    init() {
        this.videoElement = document.getElementById('camera-video');
        this.canvasElement = document.getElementById('camera-canvas');
        this._setupDragDrop();
        this._setupFileInput();
    }

    _setupDragDrop() {
        const uploadArea = document.getElementById('upload-area');
        if (!uploadArea) return;

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this._processFile(file);
            } else {
                Utils.showToast('请上传图片文件', 'warning');
            }
        });

        uploadArea.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
    }

    _setupFileInput() {
        const fileInput = document.getElementById('file-input');
        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this._processFile(file);
            }
            fileInput.value = '';
        });
    }

    async _processFile(file) {
        try {
            const base64 = await Utils.compressImage(file);
            if (this.onImageReady) {
                this.onImageReady(base64);
            }
        } catch (error) {
            Utils.showToast('图片处理失败：' + error.message, 'error');
        }
    }

    selectImage() {
        document.getElementById('file-input').click();
    }

    async startCamera() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                Utils.showToast('浏览器不支持相机功能，请使用Chrome浏览器或确保通过HTTPS访问', 'error');
                return false;
            }

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                await this.videoElement.play();
            }
            return true;
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                Utils.showToast('相机权限被拒绝，请在浏览器地址栏左侧点击图标允许相机访问', 'error');
            } else if (error.name === 'NotFoundError') {
                Utils.showToast('未找到相机设备，请检查设备是否连接', 'error');
            } else if (error.name === 'NotReadableError') {
                Utils.showToast('相机被其他应用占用，请关闭其他使用相机的应用后重试', 'error');
            } else if (error.name === 'OverconstrainedError') {
                try {
                    this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    if (this.videoElement) {
                        this.videoElement.srcObject = this.stream;
                        await this.videoElement.play();
                    }
                    return true;
                } catch (fallbackError) {
                    Utils.showToast('相机启动失败：' + fallbackError.message, 'error');
                    return false;
                }
            } else if (error.message && error.message.includes('secure context')) {
                Utils.showToast('相机功能需要HTTPS安全连接，请通过HTTPS访问应用', 'error');
            } else {
                Utils.showToast('相机启动失败：' + error.message, 'error');
            }
            return false;
        }
    }

    capturePhoto() {
        if (!this.videoElement || !this.canvasElement) return null;

        const video = this.videoElement;
        const canvas = this.canvasElement;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        this.stopCamera();
        return base64;
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }
}

window.InputManager = InputManager;
