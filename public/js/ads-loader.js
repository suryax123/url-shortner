/**
 * ads-loader.js
 * Safe ad script and iframe loader with timeout, retry and fallback UI.
 */
(function(global){
  function loadScript(url, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 7000;
    var retries = opts.retries || 1;
    var async = opts.async !== false;
    return new Promise(function(resolve, reject){
      var attempt = 0;
      function doLoad() {
        attempt++;
        var s = document.createElement('script');
        s.src = url;
        s.async = async;
        var settled = false;
        var t = setTimeout(function(){
          if (settled) return;
          settled = true;
          s.onerror = s.onload = null;
          s.remove();
          if (attempt <= retries) {
            setTimeout(doLoad, 500);
          } else {
            reject(new Error('Script load timeout: ' + url));
          }
        }, timeout);
        s.onload = function(){
          if (settled) return;
          settled = true;
          clearTimeout(t);
          resolve(s);
        };
        s.onerror = function(){
          if (settled) return;
          settled = true;
          clearTimeout(t);
          s.onerror = s.onload = null;
          s.remove();
          if (attempt <= retries) {
            setTimeout(doLoad, 500);
          } else {
            reject(new Error('Script failed to load: ' + url));
          }
        };
        document.head.appendChild(s);
      }
      doLoad();
    });
  }

  function insertIframe(container, src, width, height) {
    return new Promise(function(resolve, reject){
      var iframe = document.createElement('iframe');
      iframe.width = width || '320';
      iframe.height = height || '50';
      iframe.frameBorder = '0';
      iframe.scrolling = 'no';
      iframe.loading = 'lazy';
      iframe.style.border = '0';
      iframe.style.width = '100%';
      iframe.style.maxWidth = (width ? width + 'px' : '100%');
      iframe.src = src;
      var settled = false;
      var t = setTimeout(function(){
        if (settled) return;
        settled = true;
        iframe.onload = iframe.onerror = null;
        reject(new Error('Iframe load timeout'));
      }, 7000);
      iframe.onload = function(){
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(iframe);
      };
      iframe.onerror = function(){
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(new Error('Iframe failed'));
      };
      container.innerHTML = '';
      container.appendChild(iframe);
    });
  }

  function showFallback(container, html) {
    try {
      container.innerHTML = html || '<div class="ad-fallback">Advertisement</div>';
    } catch (e) {
      console.warn('Failed to render fallback', e);
    }
  }

  // Public: load banner using script URL (e.g., atOptions invoke) or iframe URL
  function loadBanner(options) {
    // options: {containerId, scriptUrl, iframeSrc, width, height, fallbackHTML}
    var container = document.getElementById(options.containerId);
    if (!container) return Promise.reject(new Error('Container not found: ' + options.containerId));
    // Try iframe first if provided (simpler)
    if (options.iframeSrc) {
      return insertIframe(container, options.iframeSrc, options.width, options.height)
        .catch(function(){
          // fallback to script if iframe fails
          if (options.scriptUrl) {
            return loadScript(options.scriptUrl, {timeout: options.timeout || 7000, retries: options.retries || 1})
              .then(function(){ return container; })
              .catch(function(){ showFallback(container, options.fallbackHTML); return container; });
          } else {
            showFallback(container, options.fallbackHTML);
            return container;
          }
        });
    } else if (options.scriptUrl) {
      return loadScript(options.scriptUrl, {timeout: options.timeout || 7000, retries: options.retries || 1})
        .then(function(){ return container; })
        .catch(function(){ showFallback(container, options.fallbackHTML); return container; });
    } else {
      showFallback(container, options.fallbackHTML);
      return Promise.resolve(container);
    }
  }

  // Public: load external social bar script with safe loader and fallback
  function loadSocialBar(scriptUrl, containerId, fallbackHTML) {
    var container = document.getElementById(containerId);
    if (!container) return Promise.reject(new Error('Container not found: ' + containerId));
    // Try to load script
    return loadScript(scriptUrl, {timeout:7000, retries:2})
      .then(function(){
        // Script should render itself into container; still check if empty after short delay
        return new Promise(function(resolve){
          setTimeout(function(){
            if (container.innerHTML.trim().length === 0) {
              showFallback(container, fallbackHTML || '<div class=\"social-fallback\">Connect</div>');
            }
            resolve(container);
          }, 800);
        });
      })
      .catch(function(){
        // Try loading as an iframe alternative if script fails and iframeSrc provided
        showFallback(container, fallbackHTML || '<div class="social-fallback">Connect</div>');
        return container;
      });
  }

  global.adLoader = {
    loadScript: loadScript,
    insertIframe: insertIframe,
    loadBanner: loadBanner,
    loadSocialBar: loadSocialBar,
    showFallback: showFallback
  };
})(window);
