document.addEventListener("DOMContentLoaded", function () {

  // --- CONFIGURATION & STATE ---
  Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("https://justadudewhohacks.github.io/face-api.js/models"),
  ]);

  let isSubmitting = false;
  let blobs = { 1: null, 2: null }; // Stores photo 1 and photo 2
  let currentStream = null;

  // Outfit State
  let selectedOutfit = {
    acc: null,
    body: null,
    hand: null,
    leg: null
  };

  // Assets Database - Organized by category folders
  const OUTFIT_ASSETS = {
    acc: [
      { id: 'acc1', src: 'assets/accessories/1.png' },
      { id: 'acc2', src: 'assets/accessories/2.png' },
      { id: 'acc3', src: 'assets/accessories/3.png' },
      { id: 'acc4', src: 'assets/accessories/4.png' },
      { id: 'acc5', src: 'assets/accessories/5.png' },
      { id: 'acc6', src: 'assets/accessories/6.png' },
      { id: 'acc7', src: 'assets/accessories/7.png' }
    ],
    body: [
      { id: 'body1', src: 'assets/body/1.png' },
      { id: 'body2', src: 'assets/body/2.png' },
      { id: 'body3', src: 'assets/body/3.png' },
      { id: 'body4', src: 'assets/body/4.png' },
      { id: 'body5', src: 'assets/body/5.png' },
      { id: 'body6', src: 'assets/body/6.png' }
    ],
    hand: [
      { id: 'hand1', src: 'assets/hand/1.png' },
      { id: 'hand2', src: 'assets/hand/2.png' },
      { id: 'hand3', src: 'assets/hand/3.png' },
      { id: 'hand4', src: 'assets/hand/4.png' },
      { id: 'hand5', src: 'assets/hand/5.png' },
      { id: 'hand6', src: 'assets/hand/6.png' }
    ],
    leg: [
      { id: 'leg1', src: 'assets/leg/1.png' },
      { id: 'leg2', src: 'assets/leg/2.png' },
      { id: 'leg3', src: 'assets/leg/3.png' },
      { id: 'leg4', src: 'assets/leg/4.png' },
      { id: 'leg5', src: 'assets/leg/5.png' },
      { id: 'leg6', src: 'assets/leg/6.png' }
    ]
  };

  // DOM Elements
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const takePhotoBtn = document.getElementById("take-photo");
  const nextBtn = document.getElementById("to-page-2");

  // Slot Elements
  const slots = {
    1: { img: document.getElementById("img-1"), retake: document.getElementById("retake-1"), container: document.getElementById("slot-1") },
    2: { img: document.getElementById("img-2"), retake: document.getElementById("retake-2"), container: document.getElementById("slot-2") }
  };

  // Page Elements
  const p1 = document.getElementById("p1");
  const p2 = document.getElementById("p2");
  const p3 = document.getElementById("p3");

  // --- CAMERA LOGIC ---

  async function loadCameras() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      video.srcObject = stream;
      await video.play();
      currentStream = stream;
      startDetection();
    } catch (err) {
      console.error("Gagal akses kamera:", err);
      Swal.fire("Error", "Gagal akses kamera: " + err.message, "error");
    }
  }

  async function startDetection() {
    const displaySize = { width: video.width || 300, height: video.height || 300 }; // Fallback

    // Check if video is ready
    if (video.videoWidth === 0) {
      setTimeout(startDetection, 100);
      return;
    }

    // Just a simple loop to keep video active, detection logic moved to capture time for performance
    // or keep detection for guide if needed.
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

  takePhotoBtn.addEventListener("click", async () => {
    // Determine which slot to fill
    let targetSlot = null;
    if (!blobs[1]) targetSlot = 1;
    else if (!blobs[2]) targetSlot = 2;

    if (!targetSlot) return; // Both full

    const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
    if (!detections) {
      Swal.fire("Wajah tidak terdeteksi!", "Pastikan wajah terlihat jelas.", "warning");
      return;
    }

    takePhotoBtn.disabled = true;
    await startCountdown(3);

    processCapture(targetSlot);
    takePhotoBtn.disabled = false;
  });

  async function processCapture(slotId) {
    // Verify face is still detected
    const finalDetection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
    if (!finalDetection) {
      Swal.fire("Gagal", "Wajah hilang saat capture.", "error");
      return;
    }

    // Capture square image focused on face (for circular crop)
    const captureCanvas = document.createElement("canvas");
    const size = 400; // Increased quality
    captureCanvas.width = size;
    captureCanvas.height = size;
    const ctx = captureCanvas.getContext("2d");

    // Get face bounding box
    const box = finalDetection.box;

    // Get available video dimensions
    const vW = video.videoWidth;
    const vH = video.videoHeight;

    // Calculate face center in video coordinates
    const faceCenterX = box.x + box.width / 2;
    // Shift center up slightly to capture more hair
    const faceCenterY = box.y + box.height * 0.45;

    // Base zoom factor
    const zoomFactor = 1.6;
    let faceSize = Math.max(box.width, box.height) * zoomFactor;

    // CLAMP: Ensure crop size doesn't exceed available video smallest dimension
    const maxCrop = Math.min(vW, vH);
    if (faceSize > maxCrop) {
      faceSize = maxCrop;
    }

    // Calculate source rectangle
    let srcX = faceCenterX - faceSize / 2;
    let srcY = faceCenterY - faceSize / 2;

    // CLAMP: Ensure source rectangle is within video bounds
    // (Prevents capturing 'void' which causes cut-offs or black bars)
    srcX = Math.max(0, Math.min(srcX, vW - faceSize));
    srcY = Math.max(0, Math.min(srcY, vH - faceSize));

    // Mirror & Draw face-focused crop
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);

    // Draw cropped face area
    ctx.drawImage(
      video,
      srcX, srcY, faceSize, faceSize,  // Source: clamped face area
      0, 0, size, size                 // Destination: full canvas
    );

    ctx.restore();

    captureCanvas.toBlob((blob) => {
      blobs[slotId] = blob;
      const url = URL.createObjectURL(blob);

      // Update UI
      slots[slotId].img.src = url;
      slots[slotId].img.style.display = "block";
      slots[slotId].container.querySelector(".placeholder-text").style.display = "none";
      slots[slotId].retake.style.display = "block";

      checkNextButton();
    }, "image/jpeg", 0.92); // High quality
  }

  function checkNextButton() {
    if (blobs[1] && blobs[2]) {
      nextBtn.disabled = false;
    } else {
      nextBtn.disabled = true;
    }
  }

  // Retake Logic
  function handleRetake(id) {
    blobs[id] = null;
    slots[id].img.style.display = "none";
    slots[id].container.querySelector(".placeholder-text").style.display = "block";
    slots[id].retake.style.display = "none";
    checkNextButton();
  }
  slots[1].retake.addEventListener("click", () => handleRetake(1));
  slots[2].retake.addEventListener("click", () => handleRetake(2));


  // --- PAGE 2 LOGIC ---

  let faceInterval = null;

  nextBtn.addEventListener("click", () => {
    p1.style.display = "none";
    p2.style.display = "flex";
    startFaceSwap();
    updateCategory(0); // Initialize with first category
  });

  document.getElementById("back-to-p1").addEventListener("click", () => {
    p2.style.display = "none";
    p1.style.display = "block";
    stopFaceSwap();
  });

  function startFaceSwap() {
    if (faceInterval) clearInterval(faceInterval);

    const faceImg = document.getElementById("preview-face-img");
    let currentShow = 1;

    // Set initial
    if (blobs[1]) faceImg.src = URL.createObjectURL(blobs[1]);

    faceInterval = setInterval(() => {
      currentShow = currentShow === 1 ? 2 : 1;
      if (blobs[currentShow]) {
        faceImg.src = URL.createObjectURL(blobs[currentShow]);
      }
    }, 200);
  }

  function stopFaceSwap() {
    if (faceInterval) clearInterval(faceInterval);
  }

  // Outfit Selection with Arrow Navigation
  const categories = ['acc', 'body', 'hand', 'leg'];
  const categoryNames = {
    'acc': 'AKSESORIS',
    'body': 'BADAN',
    'hand': 'TANGAN',
    'leg': 'KAKI'
  };
  let currentCategoryIndex = 0;

  const prevCategoryBtn = document.getElementById("prev-category");
  const nextCategoryBtn = document.getElementById("next-category");
  const categoryNameEl = document.getElementById("current-category-name");

  function updateCategory(index) {
    currentCategoryIndex = index;
    const category = categories[currentCategoryIndex];
    categoryNameEl.textContent = categoryNames[category];

    // Update button states
    prevCategoryBtn.disabled = currentCategoryIndex === 0;
    nextCategoryBtn.disabled = currentCategoryIndex === categories.length - 1;

    renderOutfitSelector(category);
  }

  prevCategoryBtn.addEventListener("click", () => {
    if (currentCategoryIndex > 0) {
      updateCategory(currentCategoryIndex - 1);
    }
  });

  nextCategoryBtn.addEventListener("click", () => {
    if (currentCategoryIndex < categories.length - 1) {
      updateCategory(currentCategoryIndex + 1);
    }
  });

  const itemGrid = document.getElementById("item-grid");
  const previewLayers = {
    body: document.getElementById("preview-body"),
    hat: document.getElementById("preview-hat"), // Using hat for acc/head items? User said 'Aksesoris'
    acc: document.getElementById("preview-acc")
  };

  function renderOutfitSelector(category) {
    itemGrid.innerHTML = "";
    const items = OUTFIT_ASSETS[category] || [];

    // Add "None" option
    const noneOpt = document.createElement("div");
    noneOpt.className = "item-option";
    noneOpt.innerHTML = "<span class='text-muted'>X</span>"; // or icon
    noneOpt.onclick = () => selectItem(category, null);
    itemGrid.appendChild(noneOpt);

    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "item-option";
      if (selectedOutfit[category] === item.id) el.classList.add("selected");

      const img = document.createElement("img");
      img.src = item.src;
      // Handle error for missing assets
      img.onerror = () => { img.src = "https://via.placeholder.com/60?text=" + item.id; };

      el.appendChild(img);
      el.onclick = () => selectItem(category, item);
      itemGrid.appendChild(el);
    });
  }

  function selectItem(category, item) {
    // Store only the ID, not the full object
    selectedOutfit[category] = item ? item.id : null;

    // Update visual selection
    document.querySelectorAll(".item-option").forEach(el => el.classList.remove("selected"));
    // Re-render to show selection
    renderOutfitSelector(category);

    // Update Preview - Map categories to layer IDs
    const layerMap = {
      'acc': 'preview-acc',
      'body': 'preview-body',
      'hand': 'preview-hand',
      'leg': 'preview-leg'
    };

    const targetImgId = layerMap[category];

    if (targetImgId) {
      const layer = document.getElementById(targetImgId);
      if (layer) {
        if (item) {
          layer.src = item.src;
          layer.style.display = "block";
          console.log(`Updated ${category} layer with:`, item.src);
        } else {
          layer.style.display = "none";
          console.log(`Cleared ${category} layer`);
        }
      } else {
        console.error(`Layer element not found: ${targetImgId}`);
      }
    }
  }


  // --- SUBMIT ---
  const submitBtn = document.getElementById("submit-all");
  submitBtn.addEventListener("click", async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    submitBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append("photo1", blobs[1], "photo1.jpg");
      formData.append("photo2", blobs[2], "photo2.jpg");
      formData.append("outfit", JSON.stringify(selectedOutfit));

      const res = await fetch("https://guestbook-capture.vercel.app/submit-form", {
        // const res = await fetch("http://localhost:3000/submit-form", {
        method: "POST",
        body: formData
      });

      const responseText = await res.text();
      console.log("Response status:", res.status);
      console.log("Response body:", responseText);

      if (res.ok) {
        stopFaceSwap();
        p2.style.display = "none";
        p3.style.display = "flex";
      } else {
        throw new Error(`Upload Failed: ${res.status} - ${responseText}`);
      }

    } catch (err) {
      console.error("Submit error:", err);
      Swal.fire({
        title: "Error",
        text: "Gagal menyimpan data: " + err.message,
        icon: "error",
        confirmButtonColor: "#2d9c86"
      });
    } finally {
      isSubmitting = false;
      submitBtn.innerHTML = '<i class="fas fa-upload"></i>';
      submitBtn.disabled = false;
    }
  });

  // Init
  loadCameras();

});
