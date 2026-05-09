<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";

const router = useRouter();
const toast = useToast();

const username = ref("");
const password = ref("");
const loading = ref(false);
// 2. Importando o cliente Eden Treaty do Nuxt
const { $api } = useNuxtApp()

const handleLogin = async () => {
  if (!username.value || !password.value) {
    toast.add({
      severity: "warn",
      summary: "Atenção",
      detail: "Preencha todos os campos.",
      life: 2000,
    });
    return;
  }

  loading.value = true;

 try {

// 4. A Chamada para a API (O Segredo está aqui!)
  const { data: response, error } = await $api.auth.login.post({
    username: username.value,
    password: password.value
  })

    
    if (response.success) {
      // 📍 The REAL token is already locked in the browser's HttpOnly vault by Bun.
      // We just create the harmless dummy flag for the Nuxt Router to see:
      const isAuth = useCookie("is_authenticated", {
        maxAge: 86400,
      });
      
      // ✅ THE FIX: Just a simple boolean string. No sensitive data here!
      isAuth.value = 'true';

      toast.add({
        severity: "success",
        summary: "Acesso Liberado",
        detail: "Bem-vindo ao Ecossistema.",
        life: 1000,
      });

      setTimeout(() => {
        router.push("/");
      }, 500);
    }
  } catch (error) {
    const msg = error?.data?.error || error?.message || "Falha na comunicação com o servidor.";
    toast.add({
      severity: "error",
      summary: "Acesso Negado",
      detail: msg,
      life: 3000,
    });
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div
    class="flex items-center justify-center min-h-screen bg-[#0a0f0d] text-slate-200 p-4"
  >
    <Toast />

    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#6f942e]/5 rounded-full blur-[120px] pointer-events-none"
    ></div>

    <div class="relative w-full max-w-sm flex flex-col items-center">
      <div class="mb-10 text-center flex flex-col items-center group">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="w-12 h-12 text-[#6f942e] drop-shadow-[0_0_8px_rgba(111,148,46,0.6)] mb-3"
        >
          <path
            fill-rule="evenodd"
            d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
            clip-rule="evenodd"
          />
        </svg>
        <div class="flex items-baseline gap-1.5">
          <span
            class="font-black text-slate-100 text-2xl uppercase tracking-wider"
            >SIRIUS</span
          >
          <span
            class="font-bold text-xs text-[#6f942e] uppercase tracking-[0.2em]"
            >ORCHESTRATOR</span
          >
        </div>
      </div>

      <div
        class="w-full bg-[#141b18] border border-white/5 p-8 rounded-2xl shadow-2xl backdrop-blur-sm relative overflow-hidden"
      >
        <div
          class="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#6f942e] to-transparent opacity-50"
        ></div>

        <form @submit.prevent="handleLogin" class="flex flex-col gap-6">
          <div class="flex flex-col gap-2">
            <label
              class="text-[10px] uppercase font-black text-slate-500 tracking-widest"
              >Usuário Master</label
            >
            <InputText
              v-model="username"
              class="bg-[#0a0f0d] border border-white/10 text-white focus:border-[#6f942e] transition-colors w-full"
              placeholder="Digite seu usuário"
              autocomplete="username"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label
              class="text-[10px] uppercase font-black text-slate-500 tracking-widest"
              >Chave de Acesso</label
            >
            <InputText
              v-model="password"
              type="password"
              class="bg-[#0a0f0d] border border-white/10 text-white focus:border-[#6f942e] transition-colors w-full"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          <Button
            type="submit"
            label="INICIAR SESSÃO"
            icon="pi pi-lock-open"
            :loading="loading"
            class="mt-2 bg-[#6f942e] border-none text-black font-black w-full hover:bg-[#5a7a25] h-12 transition-all active:scale-[0.98]"
          />
        </form>
      </div>

      <p
        class="mt-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest"
      >
        ACESSO RESTRITO • NÍVEL HYPERVISOR
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Remove o spinner de senha padrão dos navegadores se necessário */
input[type="password"]::-ms-reveal,
input[type="password"]::-ms-clear {
  display: none;
}
</style>
