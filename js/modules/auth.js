const Auth = (() => {

  let _currentUser = null;

  /* ============================================================
     checkSession – chama /api/auth/me
     Se não autenticado, redireciona para /login e lança exceção
     para interromper o boot do app.
  ============================================================ */
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('NOT_AUTHENTICATED');
      }
      const data = await res.json();
      _currentUser = data.user;

      // Verifica se há workspace selecionado na sessão
      const wsRes = await fetch('/api/bootstrap');
      if (wsRes.status === 403) {
        window.location.href = '/workspace';
        throw new Error('NO_WORKSPACE');
      }

      return _currentUser;
    } catch (err) {
      if (err.message === 'NOT_AUTHENTICATED' || err.message === 'NO_WORKSPACE') throw err;
      // Erro de rede – redireciona por segurança
      window.location.href = '/login';
      throw new Error('NOT_AUTHENTICATED');
    }
  }

  /* ============================================================
     getCurrentUser – retorna o usuário da sessão atual
  ============================================================ */
  function getCurrentUser() {
    return _currentUser;
  }

  /* ============================================================
     isAdmin – verifica se o usuário é admin
  ============================================================ */
  function isAdmin() {
    return _currentUser?.role === 'admin';
  }

  /* ============================================================
     logout – destrói sessão e redireciona para login
  ============================================================ */
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) { /* ignora erros de rede */ }
    window.location.href = '/login';
  }

  return { checkSession, getCurrentUser, isAdmin, logout };
})();
