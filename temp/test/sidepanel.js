// This executes cleanly without blocking the HTML frame layout paint
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("status").textContent = "Hello World! Loaded instantly.";
  });
  