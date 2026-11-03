(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let mode = "file",
    selectedFile = null,
    controller = null,
    result = null,
    urls = [];
  let currentImage = null,
    zipUrl = null,
    lastFocus = null;
  const initialStages = [...document.querySelectorAll(".art-stage")].map(
    (node) => node.outerHTML,
  );
  const cards = [...document.querySelectorAll(".art-card")];
  const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
    return `${(bytes / 1024 ** index).toFixed(index >= 2 ? 2 : 0)} ${["B", "KiB", "MiB", "GiB"][index]}`;
  };
  function setStatus(message, tone = "") {
    $("status").textContent = message;
    $("status").dataset.tone = tone;
  }
  function workflow(step) {
    ["source", "preview", "save"].forEach((name, i) => {
      const node = $(`step-${name}`);
      node.classList.toggle("active", i === step);
      node.classList.toggle("done", i < step);
      if (i === step) node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    });
  }
  function updateLoad() {
    $("load").disabled =
      Boolean(controller) ||
      (mode === "file" ? !selectedFile : !$("package-url").value.trim());
    $("reset").hidden = !selectedFile && !$("package-url").value;
  }
  function clearArtwork() {
    if ($("image-dialog").open) $("image-dialog").close();
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipUrl = null;
    result = null;
    currentImage = null;
    $("package-info").hidden = true;
    $("download-all").disabled = true;
    cards.forEach((card, index) => {
      card.querySelector(".art-stage").outerHTML = initialStages[index];
      card.dataset.state = "";
      card.querySelector(".art-meta").textContent = "Not loaded";
      card.querySelector(".save-image").disabled = true;
    });
    $("art-count").textContent = "Waiting for a package";
    workflow(0);
  }
  function selectMode(next, focus = false) {
    if (controller) return;
    if (next !== mode) clearArtwork();
    mode = next;
    for (const name of ["file", "url"]) {
      const active = mode === name;
      $(`tab-${name}`).setAttribute("aria-selected", String(active));
      $(`tab-${name}`).tabIndex = active ? 0 : -1;
      $(`panel-${name}`).hidden = !active;
    }
    if (focus) $(`tab-${mode}`).focus();
    $("source-meta").textContent =
      mode === "file" && selectedFile
        ? formatSize(selectedFile.size)
        : mode === "url"
          ? "HTTP / HTTPS"
          : "No package selected";
    setStatus("Choose a file or paste a link to get started.");
    updateLoad();
  }
  function chooseFile(file) {
    if (controller || !file) return;
    if (!file.name.toLowerCase().endsWith(".pkg")) {
      setStatus(
        "Choose a .pkg file. Other file types cannot be opened.",
        "error",
      );
      return;
    }
    clearArtwork();
    selectedFile = file;
    $("drop-title").textContent = file.name;
    $("drop-hint").textContent =
      "Package selected · Click to choose another file";
    $("drop-zone").classList.add("has-file");
    $("source-meta").textContent = formatSize(file.size);
    setStatus("Ready when you are. Press Load package to read the artwork.");
    updateLoad();
  }
  function busy(active) {
    ["tab-file", "tab-url", "drop-zone", "package-url", "reset"].forEach(
      (id) => {
        $(id).disabled = active;
      },
    );
    $("progress-panel").hidden = !active;
    $("load").classList.toggle("busy", active);
    $("load-label").textContent = active ? "Reading package…" : "Load package";
    $("art-grid").setAttribute("aria-busy", String(active));
    updateLoad();
  }
  function saveImage(image) {
    download(image.url, image.name);
    workflow(2);
  }
  function download(url, name) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
  }
  function preview(image) {
    currentImage = image;
    lastFocus = document.activeElement;
    $("dialog-title").textContent = image.name;
    $("dialog-image").src = image.url;
    $("dialog-image").alt = `${image.role} extracted from the selected package`;
    $("dialog-meta").textContent =
      `${image.width} × ${image.height} · ${formatSize(image.bytes.length)}`;
    $("dialog-download").href = image.url;
    $("dialog-download").download = image.name;
    $("image-dialog").showModal();
  }
  async function render(data, signal) {
    for (const [index, image] of data.images.entries()) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const card = cards[index],
        stage = card.querySelector(".art-stage"),
        meta = card.querySelector(".art-meta");
      card.dataset.state = image.state;
      if (image.state !== "ready") {
        stage.querySelector("span").textContent =
          image.state === "missing" ? "Not in this package" : "Cannot preview";
        meta.textContent =
          image.state === "missing" ? "Not included" : "Unreadable PNG";
        stage.title =
          image.error || "This package does not include this image.";
        continue;
      }
      const url = URL.createObjectURL(
        new Blob([image.bytes], { type: "image/png" }),
      );
      urls.push(url);
      image.url = url;
      const img = new Image();
      img.src = url;
      img.alt = image.role;
      try {
        await img.decode();
      } catch {
        image.state = "error";
        image.error = "The PNG data is damaged and cannot be displayed.";
        card.dataset.state = "error";
        stage.querySelector("span").textContent = "Cannot preview";
        stage.title = image.error;
        meta.textContent = "Damaged PNG";
        continue;
      }
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "art-stage";
      button.setAttribute("aria-label", `Preview ${image.name} at full size`);
      button.append(img);
      const expand = document.createElement("span");
      expand.className = "expand-icon";
      expand.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#i-expand"/></svg>';
      button.append(expand);
      button.addEventListener("click", () => preview(image));
      stage.replaceWith(button);
      meta.textContent = `${image.width} × ${image.height}`;
      meta.title = formatSize(image.bytes.length);
      card.querySelector(".save-image").disabled = false;
    }
  }
  async function load() {
    if (controller || $("load").disabled) return;
    if (mode === "url") {
      try {
        const u = new URL($("package-url").value.trim());
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        setStatus("Enter a valid direct HTTP or HTTPS package URL.", "error");
        $("package-url").focus();
        return;
      }
    }
    clearArtwork();
    controller = new AbortController();
    const signal = controller.signal;
    busy(true);
    $("progress").value = 0;
    setStatus("Reading only the package metadata and artwork.");
    try {
      const reader =
        mode === "file"
          ? new PKGArt.LocalReader(selectedFile, signal)
          : new PKGArt.RemoteReader($("package-url").value.trim(), signal);
      const data = await PKGArt.extract(reader, {
        signal,
        onProgress(value, label) {
          $("progress").value = value;
          $("progress-label").textContent = label;
        },
      });
      await render(data, signal);
      result = data;
      const count = data.images.filter(
        (image) => image.state === "ready",
      ).length;
      const missing = data.images.filter(
        (image) => image.state === "missing",
      ).length;
      const errors = data.images.filter((image) => image.state === "error");
      $("art-count").textContent = `${count} / 3 images available`;
      $("package-title").textContent =
        data.metadata.TITLE ||
        data.contentId ||
        (selectedFile?.name ?? "PS4 package");
      const details = [
        data.metadata.TITLE_ID || /CUSA\d+/.exec(data.contentId)?.[0],
        data.metadata.APP_VER ? `v${data.metadata.APP_VER}` : null,
        data.size !== null ? formatSize(data.size) : null,
      ].filter(Boolean);
      $("package-details").textContent = details.join(" · ");
      $("package-info").hidden = false;
      $("download-all").disabled = count === 0;
      workflow(count ? 1 : 0);
      const parts = [
        `${count} image${count === 1 ? "" : "s"} ready.`,
        `${formatSize(data.bytesRead)} read.`,
      ];
      if (missing) parts.push(`${missing} not included in this package.`);
      if (errors.length)
        parts.push(...errors.map((image) => `${image.name}: ${image.error}`));
      setStatus(
        parts.join(" "),
        count && !errors.length ? "success" : errors.length ? "error" : "",
      );
    } catch (error) {
      clearArtwork();
      setStatus(
        error.name === "AbortError"
          ? "Loading cancelled. Your source is still selected."
          : error.message || "Could not read this package. Try another file.",
        error.name === "AbortError" ? "" : "error",
      );
    } finally {
      controller = null;
      busy(false);
    }
  }
  $("tab-file").addEventListener("click", () => selectMode("file"));
  $("tab-url").addEventListener("click", () => selectMode("url"));
  document
    .querySelector(".source-tabs")
    .addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        selectMode(
          event.key === "Home"
            ? "file"
            : event.key === "End"
              ? "url"
              : mode === "file"
                ? "url"
                : "file",
          true,
        );
      }
    });
  $("drop-zone").addEventListener("click", () => {
    $("file-input").value = "";
    $("file-input").click();
  });
  $("file-input").addEventListener("change", () =>
    chooseFile($("file-input").files[0]),
  );
  ["dragenter", "dragover"].forEach((type) =>
    $("drop-zone").addEventListener(type, (event) => {
      event.preventDefault();
      if (!controller) $("drop-zone").classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((type) =>
    $("drop-zone").addEventListener(type, (event) => {
      event.preventDefault();
      $("drop-zone").classList.remove("dragover");
    }),
  );
  $("drop-zone").addEventListener("drop", (event) => {
    if (event.dataTransfer.files.length !== 1) {
      setStatus("Choose one PKG file at a time.", "error");
      return;
    }
    chooseFile(event.dataTransfer.files[0]);
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());
  $("package-url").addEventListener("input", () => {
    clearArtwork();
    updateLoad();
    setStatus("Press Load package to read the link.");
  });
  $("package-url").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      load();
    }
  });
  $("load").addEventListener("click", load);
  $("cancel").addEventListener("click", () => controller?.abort());
  $("reset").addEventListener("click", () => {
    selectedFile = null;
    $("file-input").value = "";
    $("package-url").value = "";
    $("drop-title").innerHTML =
      "Drop your package here, or <strong>browse files</strong>";
    $("drop-hint").textContent =
      "One PS4 PKG file · Read directly from your device";
    $("drop-zone").classList.remove("has-file");
    clearArtwork();
    selectMode(mode);
    $(`tab-${mode}`).focus();
  });
  cards.forEach((card, index) =>
    card.querySelector(".save-image").addEventListener("click", () => {
      if (result?.images[index].state === "ready")
        saveImage(result.images[index]);
    }),
  );
  $("download-all").addEventListener("click", () => {
    if (!result) return;
    try {
      if (!zipUrl) {
        zipUrl = URL.createObjectURL(
          PKGZip.zip(result.images.filter((image) => image.state === "ready")),
        );
      }
      const id = (result.metadata.TITLE_ID || "PKG").replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      download(zipUrl, `${id}-artwork.zip`);
      workflow(2);
      setStatus(
        "Your artwork ZIP is ready. You can download it again at any time.",
        "success",
      );
    } catch (error) {
      setStatus(
        `Could not create the ZIP: ${error.message} Try downloading the images individually.`,
        "error",
      );
    }
  });
  $("close-dialog").addEventListener("click", () => $("image-dialog").close());
  $("image-dialog").addEventListener("click", (event) => {
    if (event.target === $("image-dialog")) {
      const r = event.target.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        event.target.close();
    }
  });
  $("image-dialog").addEventListener("close", () => {
    $("dialog-image").removeAttribute("src");
    lastFocus?.focus();
    currentImage = null;
  });
  $("dialog-download").addEventListener("click", () => {
    if (currentImage) workflow(2);
  });
  window.addEventListener("pagehide", () => {
    controller?.abort();
    urls.forEach((url) => URL.revokeObjectURL(url));
    if (zipUrl) URL.revokeObjectURL(zipUrl);
  });
})();
