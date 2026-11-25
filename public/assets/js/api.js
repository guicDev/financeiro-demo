(function () {
  const jsonHeaders = { "Content-Type": "application/json" };

  function normalizeError(data, fallback) {
    if (!data) return fallback;
    return data.message || data.erro || data.error || fallback;
  }

  async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await response.json().catch(() => null) : await response.text();

    if (!response.ok) {
      const error = new Error(normalizeError(data, "Não foi possível concluir a operação."));
      if (Number.isInteger(data?.existingNoteId)) error.existingNoteId = data.existingNoteId;
      throw error;
    }

    return data;
  }

  function toQuery(params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, value);
    });
    const suffix = query.toString();
    return suffix ? `?${suffix}` : "";
  }

  function requiresEmpresa(path) {
    const pathname = String(path || "").split("?")[0];
    return pathname.startsWith("/api/")
      && !pathname.startsWith("/api/auth")
      && !pathname.startsWith("/api/empresas");
  }

  function currentEmpresaId() {
    const stateId = window.AppState && window.AppState.empresaId;
    if (stateId) return String(stateId);
    return window.localStorage.getItem("financeiro-demonstracao:empresa") || "";
  }

  async function request(path, options) {
    const requestOptions = options || {};
    const isForm = requestOptions.body instanceof FormData;
    const headers = { ...(isForm ? {} : jsonHeaders), ...(requestOptions.headers || {}) };
    const empresaId = currentEmpresaId();
    // A empresa de uma ação específica prevalece sobre o filtro global de visualização.
    if (requiresEmpresa(path) && empresaId && !headers["X-Empresa-Id"]) headers["X-Empresa-Id"] = empresaId;
    const response = await fetch(path, {
      credentials: "same-origin",
      ...requestOptions,
      headers
    });
    return parseResponse(response);
  }

  function pickArray(payload, keys) {
    if (Array.isArray(payload)) return payload;
    for (const key of keys) {
      if (Array.isArray(payload && payload[key])) return payload[key];
    }
    return [];
  }

  window.Api = {
    get: (path, params, options = {}) => request(`${path}${toQuery(params)}`, options),
    postJson: (path, body, options = {}) => request(path, { ...options, method: "POST", body: JSON.stringify(body || {}) }),
    putJson: (path, body, options = {}) => request(path, { ...options, method: "PUT", body: JSON.stringify(body || {}) }),
    postForm: (path, formData, options = {}) => request(path, { ...options, method: "POST", body: formData }),
    putForm: (path, formData, options = {}) => request(path, { ...options, method: "PUT", body: formData }),
    delete: (path, options = {}) => request(path, { ...options, method: "DELETE" }),
    toQuery,
    pickArray,
    requiresEmpresa
  };
})();
