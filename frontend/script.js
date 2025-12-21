document.addEventListener("DOMContentLoaded", function () {
  const textarea = document.getElementById("comment");

  textarea.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });

  Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("https://justadudewhohacks.github.io/face-api.js/models"),
  ])


  let isSubmitting = false;
  let capturedBlob = null;
  let currentStream = null;

  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const takePhotoBtn = document.getElementById("take-photo");
  const photoPreview = document.getElementById("photo-preview");
  const retakePhotoBtn = document.getElementById("retake-photo");
  const faceGuide = document.getElementById("face-guide-container");

  // --- Load kamera ---
  async function loadCameras() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }, // "user" = kamera depan, "environment" = kamera belakang
      });
      video.srcObject = stream;
      await video.play();
      currentStream = stream;
    } catch (err) {
      console.error("Gagal akses kamera:", err);
      Swal.fire("Error", "Tidak bisa mengakses kamera: " + err.message, "error");
    }
  }


  // --- Start kamera dengan fallback ---

  async function startDetection() {
    const displaySize = { width: video.width, height: video.height };

    // Buat canvas overlay untuk bounding box
    const overlay = faceapi.createCanvasFromMedia(video);
    overlay.style.position = "absolute";
    overlay.style.left = video.offsetLeft + "px";
    overlay.style.top = video.offsetTop + "px";
    document
      .querySelector(".d-flex.justify-content-center.mb-2")
      .appendChild(overlay);

    faceapi.matchDimensions(overlay, displaySize);

    setInterval(async () => {
      if (video.readyState === 4) {
        const detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions()
        );
        const resized = faceapi.resizeResults(detections, displaySize);

        overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
        faceapi.draw.drawDetections(overlay, resized);
      }
    }, 200);
  }

  function startCountdown(seconds = 3) {
    return new Promise((resolve) => {
      const countdownEl = document.getElementById("countdown");
      let counter = seconds;

      countdownEl.textContent = counter;
      countdownEl.style.display = "block";

      const interval = setInterval(() => {
        counter--;
        if (counter > 0) {
          countdownEl.textContent = counter;
        } else {
          clearInterval(interval);
          countdownEl.style.display = "none";
          resolve();
        }
      }, 1000);
    });
  }

  // --- Capture foto (mirror & preview) ---
  takePhotoBtn.addEventListener("click", async () => {
    // 1. Cek deteksi wajah sebelum countdown
    const detections = await faceapi.detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions()
    );

    if (!detections) {
      Swal.fire(
        "Wajah tidak terdeteksi!",
        "Pastikan wajah terlihat jelas di dalam bingkai.",
        "error"
      );
      return;
    }

    // 2. Countdown
    takePhotoBtn.disabled = true;
    await startCountdown(3);
    takePhotoBtn.disabled = false;

    // 3. Ambil ulang deteksi tepat saat foto diambil untuk akurasi crop
    const finalDetection = await faceapi.detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions()
    );

    if (!finalDetection) {
       Swal.fire("Gagal!", "Wajah hilang saat pengambilan foto. Silakan coba lagi.", "error");
       return;
    }

    const { box } = finalDetection;
    
    // Konfigurasi Crop (tambah padding agar tidak terlalu mepet)
    const padding = 0.4; // 40% padding
    const cropX = Math.max(0, box.x - box.width * padding);
    const cropY = Math.max(0, box.y - box.height * padding);
    const cropWidth = Math.min(video.videoWidth - cropX, box.width * (1 + padding * 2));
    const cropHeight = Math.min(video.videoHeight - cropY, box.height * (1 + padding * 2));

    // --- PROSES CROP (untuk database) ---
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 300; // Ukuran standar wajah (biar enteng di DB)
    cropCanvas.height = 300;
    const cropCtx = cropCanvas.getContext("2d");
    
    // Mirroring untuk crop juga agar konsisten
    cropCtx.save();
    cropCtx.translate(cropCanvas.width, 0);
    cropCtx.scale(-1, 1);
    
    // Gambar hanya area wajah dari video (perhatikan videoWidth/height vs css width/height jika beda)
    // Karena video asli di mirror di UI (transform: scaleX(-1)), kita harus hati-hati koordinatnya.
    // face-api biasanya mendeteksi pada koordinat elemen asli (non-mirrored).
    cropCtx.drawImage(
      video, 
      cropX, cropY, cropWidth, cropHeight, // Source
      0, 0, cropCanvas.width, cropCanvas.height // Destination
    );
    cropCtx.restore();

    // --- PROSES PREVIEW FULL (untuk UI agar bagus) ---
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const context = canvas.getContext("2d");
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.restore();

    // Simpan hasil crop ke capturedBlob
    cropCanvas.toBlob((blob) => {
      capturedBlob = blob;
      
      // Preview tetap pakai foto FULL (canvas utama) sesuai request
      const fullUrl = canvas.toDataURL("image/jpeg");
      photoPreview.src = fullUrl;
      photoPreview.style.display = "block";
      
      video.style.display = "none";
      faceGuide.style.display = "none";
      takePhotoBtn.style.display = "none";
      retakePhotoBtn.style.display = "inline-block";
      
      Swal.fire("Foto berhasil diambil!", "Wajah Anda telah di-crop untuk database.", "success");
    }, "image/jpeg", 0.8);
  });

  // --- Foto ulang ---
  retakePhotoBtn.addEventListener("click", () => {
    photoPreview.style.display = "none";
    retakePhotoBtn.style.display = "none";
    video.style.display = "block";
    faceGuide.style.display = "block";
    takePhotoBtn.style.display = "inline-block";
    capturedBlob = null;
  });

  document.getElementById("next").addEventListener("click", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const name = document.getElementById("name").value.trim();
    const comment = document.getElementById("comment").value.trim();

    if (!name || !comment) {
      Swal.fire("Oops...", "Isi semua kolom terlebih dahulu!", "error");
      return;
    }
    if (!capturedBlob) {
      Swal.fire("Oops...", "Ambil foto dulu!", "error");
      return;
    }

    isSubmitting = true;
    const btnNext = document.getElementById("next");
    btnNext.disabled = true;
    btnNext.textContent = "Memproses...";

    try {
      await submit(name, comment, capturedBlob);
      document.getElementById("p2").style.display = "block";
      document.getElementById("p1").style.display = "none";
      showThankYouScreen({ name });
    } finally {
      isSubmitting = false;
      btnNext.disabled = false;
      btnNext.textContent = "MASUK";
    }
  });

  async function submit(name, comment, photoBlob) {
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("comment", comment);
      formData.append("photo", photoBlob, "camera-photo.jpg");

      const response = await fetch(
        "https://guestbook-capute.vercel.app/submit-form",
        {
          // const response = await fetch("http://localhost:3000/submit-form", {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorMessage}`
        );
      }

      const responseData = await response.json();
      console.log("Response Data:", responseData);
    } catch (error) {
      console.error("Error submitting data:", error.message || error);
    }
  }

  function showThankYouScreen(data) {
    const { name } = data;
    document.getElementById("user-name").textContent = name;
    const p2 = document.getElementById("p2");
    p2.style.display = "flex";
    p2.style.flexDirection = "column";
    p2.style.alignItems = "center";
  }

  // --- Start ---
  loadCameras();
});
