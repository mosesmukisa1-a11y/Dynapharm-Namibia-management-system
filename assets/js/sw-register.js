/* global loadShopProducts */

// Try to sync with main system's product data
window.addEventListener("storage", function (e) {
  if (e.key === "dyna_price_list" || e.key === "dyna_products") {
    loadShopProducts();
  }
});

// Register service worker to ensure latest cache version
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then(function (registration) {
        console.log("ServiceWorker registered:", registration.scope);
        // Force immediate update check
        registration.update();

        // Listen for updates
        registration.addEventListener("updatefound", function () {
          const newWorker = registration.installing;
          newWorker.addEventListener("statechange", function () {
            if (newWorker.state === "activated") {
              // New service worker activated, reload to get fresh content
              if (navigator.serviceWorker.controller) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch(function (error) {
        console.log("ServiceWorker registration failed:", error);
      });

    // Check if there's a waiting service worker and prompt reload
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      window.location.reload();
    });
  });
}
