/**
 * Initializes the Watchtower collector for a monitored application.
 * Automatically attaches global error listeners, tracks page performance,
 * and intercepts fetch() calls to monitor API latency.
 * 
 * @example
 * Drop this script tag into any app 
 * <script id="collector-script" 
 *     src="link to collector file" 
 *     data-apikey="[apiKey]" 
 *     data-release="[release version]">
 * </script>
 * @param apiKey The apiKey for app
 * @param release The release version of app
 */
function Collector(apiKey, release) {
    const baseUrl = "http://localhost:3000"; // Update with your backend URL if different

    const routes = {
        error: `${baseUrl}/api/events/error`,
        performance: `${baseUrl}/api/events/performance`,
    };

    trackApiPerformance();

    window.addEventListener("error", (e) => trackError(e.error));
    window.addEventListener("unhandledrejection", (e) => trackError(e.reason));
    if (document.readyState === "complete") {
        trackPerformance();
    } else {
        window.addEventListener("load", () => trackPerformance());
    }
    /**
     * Sends a Watchtower event payload to the matching API endpoint.
     * Uses navigator.sendBeacon when available, then falls back to fetch if
     * sendBeacon is unavailable or fails.
     * @param {{
     *   type: "error" | "performance",
     *   apiKey: string,
     *   message?: string,
     *   stack?: string | null,
     *   url?: string,
     *   errorType?: string,
     *   severity?: "low" | "medium" | "high" | "critical",
     *   loadTimeMs?: number,
     *   domContentLoadedMs?: number,
     *   ttfbMs?: number,
     *   apiEndpoint?: string | null,
     *   apiLatencyMs?: number | null,
     *   memoryMB?: number | null,
     *   release?: string,
     *   timestamp?: string
     * }} payload - Event data to send.
     */
    function sendEvent(payload) {
        const endpoint = routes[payload.type];
        const data = JSON.stringify(payload);
        const blob = new Blob([data], {
            type: "application/json",
        });
        const sent = navigator.sendBeacon?.(endpoint, blob);
        if (!sent) {
            fetch(endpoint, {
                method: "POST",
                body: data,
                headers: { "Content-Type": "application/json" },
                keepalive: true,
            });
        }
    }
    /**
     * Tracks a JavaScript error and sends it to the Watchtower error endpoint.
     * Builds an error event payload using the configured API key and release,
     * then sends the event through sendEvent().
     * @param error - The error object or value to track.
     */
    function trackError(error) {
        sendEvent({
            type: "error",
            apiKey: apiKey,
            message: error?.message || String(error),
            stack: error?.stack || null,
            url: window.location.href,
            errorType: error?.constructor?.name || "Error",
            severity: getSeverity(error),
            release: release,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Determines the severity level for a JavaScript error.
     *
     * Severity is based on the error type and message:
     * - TypeError and ReferenceError are critical
     * - SyntaxError, network, fetch, and failed errors are high
     * - Timeout and RangeError errors are medium
     * - All other errors are low
     * @param error - The error object or value to evaluate.
     * @returns The calculated severity level.
     */
    function getSeverity(error) {
        if (!error) return "low";
        const message = error.message?.toLowerCase() || "";
        const type = error.constructor?.name || "";
        if (type === "TypeError" || type === "ReferenceError") return "critical";
        if (type === "SyntaxError") return "high";
        if (message.includes("network") || message.includes("fetch") || message.includes("failed")) return "high";
        if (message.includes("timeout")) return "medium";
        if (type === "RangeError") return "medium";
        return "low";
    }

    /**
     * Tracks browser page performance using the Performance API.
     * Collects metrics such as:
     * - loadTimeMs: total time for the page to fully load
     * - domContentLoadedMs: time until the DOM content is loaded
     * - ttfbMs: time for the server/network response
     * - memoryMB: estimated JavaScript memory usage in MB
     *
     * Sends the collected performance metrics to the
     * Watchtower performance endpoint using sendEvent().
     */
    function trackPerformance() {
        const navigation = performance.getEntriesByType("navigation");
        const nav = navigation[0];

        if (!nav) return;

        const loadTimeMs = nav.loadEventEnd - nav.startTime;
        const domContentLoadedMs = nav.domContentLoadedEventEnd - nav.startTime;
        const serverResponseTimeMs = nav.responseEnd - nav.requestStart;
        const memoryMB = performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;

        sendEvent({
            type: "performance",
            apiKey: apiKey,
            url: window.location.href,
            loadTimeMs: loadTimeMs,
            domContentLoadedMs: domContentLoadedMs,
            ttfbMs: serverResponseTimeMs,
            apiEndpoint: null,
            apiLatencyMs: null,
            memoryMB: memoryMB,
            release: release,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Tracks API request performance by intercepting fetch() calls.
     * Collects metrics such as:
     * - apiEndpoint: the API route being requested
     * - apiLatencyMs: total time for the API request to complete
     *
     * Sends the collected API performance metrics to the
     * Watchtower performance endpoint using sendEvent().
     */
    function trackApiPerformance() {
        const originalFetch = window.fetch;

        window.fetch = async (...args) => {
            const startTime = Date.now();
            const apiEndpoint =
                typeof args[0] === "string" ? args[0] : args[0]?.url;

            if (apiEndpoint === routes.performance || apiEndpoint === routes.error) {
                return originalFetch(...args);
            }

            try {
                const response = await originalFetch(...args);
                const endTime = Date.now();

                sendEvent({
                    type: "performance",
                    apiKey: apiKey,
                    apiEndpoint,
                    apiLatencyMs: endTime - startTime,
                    url: window.location.href,
                    release: release,
                    timestamp: new Date().toISOString(),
                });

                return response;
            } catch (error) {
                const endTime = Date.now();

                sendEvent({
                    type: "performance",
                    apiKey: apiKey,
                    apiEndpoint,
                    apiLatencyMs: endTime - startTime,
                    url: window.location.href,
                    release: release,
                    timestamp: new Date().toISOString(),
                });

                throw error;
            }
        };
    }
}
const script = document.getElementById('collector-script');
const apiKey = script.dataset.apikey;
const release = script.dataset.release;
Collector(apiKey, release);
