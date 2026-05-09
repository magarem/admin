export default defineNuxtRouteMiddleware((to, from) => {
  // 📍 Lemos a "flag visual" inofensiva. 
  // O token HttpOnly real está oculto e seguro contra o JavaScript!
  const isAuth = useCookie('is_authenticated');
  console.log("🚀 ~ isAuth:", isAuth.value)

  // 1. Se o usuário NÃO tem a flag e tenta ir para qualquer lugar exceto '/login'
  if (!isAuth.value && to.path !== '/login') {
    return navigateTo('/login');
  }

  // 2. Se o usuário JÁ TEM a flag e tenta acessar a página de login
  if (isAuth.value && to.path === '/login') {
    return navigateTo('/'); // Manda ele de volta para o dashboard
  }
});