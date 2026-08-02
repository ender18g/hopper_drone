(() => {
  const root = document.documentElement;
  const updateProgress = () => {
    const scrollable = Math.max(1, root.scrollHeight - window.innerHeight);
    const progress = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
    root.style.setProperty("--lesson-progress", `${progress}%`);
  };

  const copyCode = async (button) => {
    const block = button.closest(".lesson-code");
    const code = block?.querySelector("code")?.textContent ?? "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = code;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    const previous = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1400);
  };

  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress, { passive: true });
  document.addEventListener("click", (event) => {
    const copyButton = event.target.closest?.("[data-copy-code]");
    if (copyButton) void copyCode(copyButton);
    if (event.target.closest?.("[data-print-lesson]")) window.print();
  });
  updateProgress();
})();
