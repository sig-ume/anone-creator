(function () {
  "use strict";

  // --- DOM Elements ---
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const previewArea = document.getElementById("preview-area");
  const imageCount = document.getElementById("image-count");
  const submitBtn = document.getElementById("submit-btn");
  const formSection = document.getElementById("form-section");
  const processingSection = document.getElementById("processing-section");
  const statusText = document.getElementById("status-text");
  const resultSection = document.getElementById("result-section");
  const downloadLink = document.getElementById("download-link");
  const resetBtn = document.getElementById("reset-btn");
  const errorSection = document.getElementById("error-section");
  const errorMessage = document.getElementById("error-message");
  const errorResetBtn = document.getElementById("error-reset-btn");

  const MAX_IMAGES = 25;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ["image/jpeg", "image/png"];
  const POLL_INTERVAL_MS = 2000;

  /** @type {File[]} */
  let selectedFiles = [];

  // --- File Selection ---

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener("change", () => {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = "";
  });

  function handleFiles(files) {
    const imageFiles = files.filter((f) => ALLOWED_TYPES.includes(f.type));

    if (imageFiles.length !== files.length) {
      alert("JPGまたはPNG画像のみアップロードできます。");
    }

    const oversized = imageFiles.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      alert("10MBを超えるファイルがあります: " + oversized.map((f) => f.name).join(", "));
      return;
    }

    const total = selectedFiles.length + imageFiles.length;
    if (total > MAX_IMAGES) {
      alert("画像は最大" + MAX_IMAGES + "枚までです。現在" + selectedFiles.length + "枚選択中です。");
      return;
    }

    selectedFiles = selectedFiles.concat(imageFiles);
    updatePreview();
  }

  function updatePreview() {
    previewArea.innerHTML = "";

    if (selectedFiles.length === 0) {
      previewArea.classList.add("hidden");
      imageCount.classList.add("hidden");
      submitBtn.disabled = true;
      return;
    }

    previewArea.classList.remove("hidden");
    imageCount.classList.remove("hidden");
    submitBtn.disabled = false;

    imageCount.textContent = selectedFiles.length + " / " + MAX_IMAGES + " 枚";

    selectedFiles.forEach((file, index) => {
      var wrapper = document.createElement("div");
      wrapper.className = "preview-item";

      var img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.className = "preview-img";
      img.onload = function () { URL.revokeObjectURL(img.src); };

      var removeBtn = document.createElement("button");
      removeBtn.className = "preview-remove";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        selectedFiles.splice(index, 1);
        updatePreview();
      });

      var num = document.createElement("span");
      num.className = "preview-num";
      num.textContent = String(index + 1);

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      wrapper.appendChild(num);
      previewArea.appendChild(wrapper);
    });
  }

  // --- Section Switching ---

  function showSection(section) {
    formSection.classList.add("hidden");
    processingSection.classList.add("hidden");
    resultSection.classList.add("hidden");
    errorSection.classList.add("hidden");
    section.classList.remove("hidden");
  }

  function resetAll() {
    selectedFiles = [];
    updatePreview();
    showSection(formSection);
  }

  resetBtn.addEventListener("click", resetAll);
  errorResetBtn.addEventListener("click", resetAll);

  // --- PoW Solver ---

  async function solvePoW(challenge, difficulty) {
    statusText.textContent = "認証計算中...";
    var prefix = "0".repeat(difficulty);
    var nonce = 0;

    while (true) {
      var data = challenge + String(nonce);
      var buffer = new TextEncoder().encode(data);
      var hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      var hashHex = hashArray.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");

      if (hashHex.startsWith(prefix)) {
        return String(nonce);
      }
      nonce++;

      // Yield to UI every 1000 iterations
      if (nonce % 1000 === 0) {
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    }
  }

  // --- Submit Flow ---

  submitBtn.addEventListener("click", async function () {
    if (selectedFiles.length === 0) return;

    showSection(processingSection);

    try {
      // 1. Get PoW challenge
      statusText.textContent = "認証チャレンジを取得中...";
      var challengeRes = await fetch("/api/challenge");
      if (!challengeRes.ok) throw new Error("チャレンジの取得に失敗しました");
      var challengeData = await challengeRes.json();

      // 2. Solve PoW
      var nonce = await solvePoW(challengeData.challenge, challengeData.difficulty);

      // 3. Upload
      statusText.textContent = "アップロード中...";
      var formData = new FormData();
      selectedFiles.forEach(function (file) {
        formData.append("images[]", file);
      });
      formData.append("challenge", challengeData.challenge);
      formData.append("nonce", nonce);

      var renderRes = await fetch("/api/render", {
        method: "POST",
        body: formData,
      });

      if (!renderRes.ok) {
        var errData = await renderRes.json().catch(function () { return {}; });
        throw new Error(errData.error || "アップロードに失敗しました");
      }

      var renderData = await renderRes.json();
      var jobId = renderData.jobId;

      // 4. Poll for status
      statusText.textContent = "動画を生成中...";
      await pollStatus(jobId);
    } catch (err) {
      errorMessage.textContent = err.message || "不明なエラーが発生しました";
      showSection(errorSection);
    }
  });

  async function pollStatus(jobId) {
    while (true) {
      await new Promise(function (r) { setTimeout(r, POLL_INTERVAL_MS); });

      var res = await fetch("/api/status/" + jobId);
      if (!res.ok) throw new Error("ステータスの取得に失敗しました");

      var data = await res.json();

      if (data.status === "done") {
        downloadLink.href = "/api/download/" + jobId;
        downloadLink.textContent = "ダウンロード";
        showSection(resultSection);
        return;
      }

      if (data.status === "failed") {
        throw new Error("動画の生成に失敗しました。もう一度お試しください。");
      }

      if (data.status === "running") {
        statusText.textContent = "動画を生成中...";
      } else {
        statusText.textContent = "順番待ち中...";
      }
    }
  }
})();
