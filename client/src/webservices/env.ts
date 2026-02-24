

export const env = _env();

function _env() {
    const apiHost = window.__env__?.API_URL ?? "localhost:2567";
    const secure = window.location.protocol === "https:";
    return {
        apiUrl: `${secure ? "https" : "http"}://${apiHost}`,
        colyseusUrl: `${secure ? "wss" : "ws"}://${apiHost}`,
    };
}
