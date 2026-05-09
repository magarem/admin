<script setup>
import { ref, computed, onMounted } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";

const toast   = useToast();
const confirm = useConfirm();
const { $api } = useNuxtApp();

// ─── State ─────────────────────────────────────────────────
const sites   = ref([]);
const pending = ref(true);

// Clone modal
const showCloneModal = ref(false);
const cloneForm      = ref({ name: "", sourceId: "" });
const isCloning      = ref(false);

// Rename modal
const showRenameModal = ref(false);
const renameTarget    = ref(null);
const renameForm      = ref({ displayName: "", newId: "" });
const isRenaming      = ref(false);
const renameIdChanged = computed(() =>
  renameForm.value.newId.trim() !== (renameTarget.value?.id || "")
);

// Users modal
const showUsersModal = ref(false);
const users          = ref([]);
const newUserForm    = ref({ username: "", password: "", role: "admin" });
const isAddingUser   = ref(false);

// ─── Fetch sites ───────────────────────────────────────────
const fetchSites = async () => {
  pending.value = true;
  try {
    const { data: res } = await $api.sites.get();
    if (res?.success) sites.value = res.sites;
    else throw new Error(res?.error || "Erro ao listar sites");
  } catch (e) {
    toast.add({ severity: "error", summary: "Erro", detail: "Falha ao comunicar com o servidor.", life: 4000 });
  } finally {
    pending.value = false;
  }
};

// ─── Fetch users ───────────────────────────────────────────
const fetchUsers = async () => {
  try {
    const { data: res } = await $api.auth.users.get();
    if (res?.success) users.value = res.users;
  } catch {}
};

onMounted(fetchSites);

// ─── Clone ─────────────────────────────────────────────────
const openCloneModal = () => {
  const hasCv = sites.value.find(s => s.id === "confraria-vegana");
  cloneForm.value = { name: "", sourceId: hasCv ? "confraria-vegana" : (sites.value[0]?.id || "") };
  showCloneModal.value = true;
};

const handleClone = async () => {
  if (!cloneForm.value.name.trim()) return;
  isCloning.value = true;
  try {
    const { data: res } = await $api.sites.post({
      name: cloneForm.value.name.trim(),
      sourceId: cloneForm.value.sourceId || undefined
    });
    if (res?.success) {
      toast.add({ severity: "success", summary: "Site Criado", detail: `"${res.site.name}" em ${res.site.url} — a construir em background (bun install → build → pm2 start). Pronto em 1-2 min.`, life: 8000 });
      showCloneModal.value = false;
      cloneForm.value = { name: "", sourceId: "" };
      await fetchSites();
    } else throw new Error(res?.error);
  } catch (e) {
    toast.add({ severity: "error", summary: "Erro", detail: e?.message || "Falha ao criar site.", life: 4000 });
  } finally {
    isCloning.value = false;
  }
};

// ─── Rename ────────────────────────────────────────────────
const openRenameModal = (site) => {
  renameTarget.value = site;
  renameForm.value   = { displayName: site.name, newId: site.id };
  showRenameModal.value = true;
};

const handleRename = async () => {
  const id   = renameTarget.value.id;
  const body = {};
  const trimmedName = renameForm.value.displayName.trim();
  const trimmedId   = renameForm.value.newId.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  if (trimmedName && trimmedName !== renameTarget.value.name) body.displayName = trimmedName;
  if (trimmedId  && trimmedId  !== id)                         body.newId       = trimmedId;
  if (!body.displayName && !body.newId) { showRenameModal.value = false; return; }

  isRenaming.value = true;
  try {
    const { data: res } = await $api.sites[id].patch(body);
    if (res?.success) {
      toast.add({ severity: "success", summary: "Atualizado", detail: "Site atualizado com sucesso.", life: 3000 });
      showRenameModal.value = false;
      await fetchSites();
    } else throw new Error(res?.error);
  } catch (e) {
    toast.add({ severity: "error", summary: "Erro", detail: e?.message || "Falha ao atualizar.", life: 4000 });
  } finally {
    isRenaming.value = false;
  }
};

// ─── Toggle pause ──────────────────────────────────────────
const handleToggle = async (site) => {
  const prev   = site.status;
  site.status  = prev === "running" ? "paused" : "running";
  try {
    const { data: res } = await $api.sites[site.id].toggle.post();
    if (res?.success) {
      site.status = res.status;
      const paused = site.status === "paused";
      toast.add({ severity: paused ? "warn" : "success", summary: paused ? "Site Pausado" : "Site Ativo", detail: `${site.name} ${paused ? "marcado como pausado" : "marcado como ativo"}.`, life: 3000 });
    } else throw new Error(res?.error);
  } catch (e) {
    site.status = prev;
    toast.add({ severity: "error", summary: "Erro", detail: "Falha ao alterar status.", life: 3000 });
  }
};

// ─── Delete ────────────────────────────────────────────────
const confirmDelete = (site) => {
  confirm.require({
    group: "ecosystem",
    message: `Apagar "${site.name}" (${site.id}) e todo o seu conteúdo? Esta ação não pode ser desfeita.`,
    header: "Apagar Site",
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Apagar",
    acceptClass: "p-button-danger",
    rejectLabel: "Cancelar",
    accept: async () => {
      try {
        const { data: res } = await $api.sites[site.id].delete();
        if (res?.success) {
          sites.value = sites.value.filter(s => s.id !== site.id);
          toast.add({ severity: "success", summary: "Site Apagado", detail: `"${site.name}" foi removido.`, life: 3000 });
        } else throw new Error(res?.error);
      } catch (e) {
        toast.add({ severity: "error", summary: "Erro", detail: e?.message || "Falha ao apagar.", life: 4000 });
      }
    }
  });
};

// ─── Users ─────────────────────────────────────────────────
const openUsersModal = async () => {
  await fetchUsers();
  showUsersModal.value = true;
};

const handleAddUser = async () => {
  if (!newUserForm.value.username.trim() || !newUserForm.value.password.trim()) return;
  isAddingUser.value = true;
  try {
    const { data: res } = await $api.auth.users.post({
      username: newUserForm.value.username.trim(),
      password: newUserForm.value.password.trim(),
      role: newUserForm.value.role
    });
    if (res?.success) {
      toast.add({ severity: "success", summary: "Utilizador Criado", detail: `"${res.user.username}" adicionado.`, life: 3000 });
      newUserForm.value = { username: "", password: "", role: "admin" };
      await fetchUsers();
    } else throw new Error(res?.error);
  } catch (e) {
    toast.add({ severity: "error", summary: "Erro", detail: e?.message || "Falha ao criar utilizador.", life: 4000 });
  } finally {
    isAddingUser.value = false;
  }
};

const confirmDeleteUser = (user) => {
  confirm.require({
    group: "ecosystem",
    message: `Remover o utilizador "${user.username}"?`,
    header: "Remover Utilizador",
    icon: "pi pi-user-minus",
    acceptLabel: "Remover",
    acceptClass: "p-button-danger",
    rejectLabel: "Cancelar",
    accept: async () => {
      try {
        const { data: res } = await $api.auth.users[user.id].delete();
        if (res?.success) {
          users.value = users.value.filter(u => u.id !== user.id);
          toast.add({ severity: "success", summary: "Removido", detail: "Utilizador apagado.", life: 3000 });
        } else throw new Error(res?.error);
      } catch (e) {
        toast.add({ severity: "error", summary: "Erro", detail: e?.message || "Falha ao remover.", life: 4000 });
      }
    }
  });
};

// ─── Auth ──────────────────────────────────────────────────
const handleLogout = async () => {
  try { await $api.auth.logout.post(); } catch {}
  useCookie("is_authenticated").value = null;
  window.location.href = "/login";
};

const config  = useRuntimeConfig()
const openCms = (site) => window.open(`${config.public.cmsUrl}/${site.id}`, "_blank");

// ─── DataTable PT ──────────────────────────────────────────
const tablePt = {
  root: { class: "w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#070b09] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]" },
  table: { class: "w-full border-collapse" },
  thead: { class: "bg-[#050706] sticky top-0 z-10" },
  headerRow: { class: "bg-transparent" },
  headerCell: { class: "px-6 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 border-b border-white/[0.06]" },
  bodyRow: ({ context }) => ({
    class: [
      "border-b border-white/[0.04] transition-all duration-150 group",
      context.index % 2 === 0 ? "bg-[#070b09]" : "bg-[#0b120e]",
      "hover:bg-[#101a13]"
    ]
  }),
  bodyCell: { class: "px-6 py-4 text-slate-300 align-middle group-hover:text-white transition-colors" },
  pcPaginator: {
    root: { class: "bg-[#050706] border-t border-white/[0.06] px-6 py-4 flex items-center justify-center gap-2 rounded-b-2xl" },
    pages: { class: "flex gap-1.5" },
    first: { class: "paginator-btn" },
    prev:  { class: "paginator-btn" },
    next:  { class: "paginator-btn" },
    last:  { class: "paginator-btn" },
    page: ({ context }) => ({
      class: [
        "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-all cursor-pointer",
        context.active ? "bg-[#6f942e] text-black shadow-[0_0_14px_rgba(111,148,46,0.45)] scale-105" : "text-slate-500 hover:bg-white/5 hover:text-white"
      ]
    })
  }
};
</script>

<template>
  <div class="flex flex-col h-screen bg-[#0a0f0d] text-slate-200 p-8 gap-6 overflow-hidden">
    <Toast />
    <ConfirmDialog group="ecosystem">
      <template #message="{ message }">
        <div class="flex gap-4 items-start p-2">
          <i :class="message.icon" class="text-3xl text-red-500 mt-0.5 shrink-0"></i>
          <p class="text-slate-200 text-sm leading-relaxed">{{ message.message }}</p>
        </div>
      </template>
    </ConfirmDialog>

    <!-- ─── Header ──────────────────────────────────────── -->
    <header class="flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-2xl font-black tracking-widest text-white flex items-center gap-3">
          <i class="pi pi-globe text-[#6f942e]"></i>
          Sirius Eco System
        </h1>
        <p class="text-xs text-slate-500 font-mono mt-1">
          Gestão de sites &mdash; <span class="text-slate-600">sites/web/</span>
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          label="NOVO SITE"
          icon="pi pi-plus"
          @click="openCloneModal"
          class="bg-[#6f942e] border-none text-black font-black hover:bg-[#5a7a25] text-sm"
        />
        <Button
          icon="pi pi-users"
          severity="secondary"
          text
          rounded
          class="text-slate-400 hover:text-[#6f942e] bg-white/5"
          @click="openUsersModal"
          v-tooltip.top="'Gerir Utilizadores'"
        />
        <Button
          icon="pi pi-power-off"
          severity="secondary"
          text
          rounded
          class="text-slate-400 hover:text-red-500 bg-white/5"
          @click="handleLogout"
          v-tooltip.top="'Encerrar Sessão'"
        />
      </div>
    </header>

    <!-- ─── DataTable ───────────────────────────────────── -->
    <div class="flex-1 min-h-0 overflow-auto rounded-2xl border border-white/[0.06]">
      <DataTable
        :value="sites"
        :loading="pending"
        :paginator="true"
        :rows="10"
        :rowsPerPageOptions="[10, 20, 50]"
        :alwaysShowPaginator="true"
        unstyled
        class="w-full text-sm"
        :pt="tablePt"
      >
        <template #empty>
          <div class="p-16 text-center flex flex-col items-center gap-3 text-zinc-600">
            <i class="pi pi-server text-5xl opacity-30"></i>
            <span class="text-sm uppercase tracking-widest font-semibold">Nenhum site encontrado</span>
            <p class="text-xs text-zinc-700">Clique em "Novo Site" para criar o primeiro.</p>
          </div>
        </template>

        <!-- Site -->
        <Column header="Site" style="min-width: 280px">
          <template #body="{ data }">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                <i class="pi pi-sitemap text-[#6f942e] text-xs"></i>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="font-semibold text-white text-sm">{{ data.name }}</span>
                <span class="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                  <i class="pi pi-folder text-[9px]"></i>
                  sites/web/{{ data.id }}
                </span>
              </div>
            </div>
          </template>
        </Column>

        <!-- Port -->
        <Column header="Porta" style="width: 110px">
          <template #body="{ data }">
            <span v-if="data.port" class="text-xs font-mono bg-white/5 border border-white/10 px-2.5 py-1 rounded text-slate-400">
              :{{ data.port }}
            </span>
            <span v-else class="text-xs text-zinc-700 font-mono">—</span>
          </template>
        </Column>

        <!-- Status -->
        <Column header="Status" style="width: 130px">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full shadow-lg shrink-0"
                :class="data.status === 'running' ? 'bg-[#6f942e] shadow-[#6f942e]/60 animate-pulse' : 'bg-amber-500 shadow-amber-500/50'"
              ></span>
              <span
                class="text-[10px] uppercase tracking-widest font-bold"
                :class="data.status === 'running' ? 'text-[#6f942e]' : 'text-amber-500'"
              >
                {{ data.status === "running" ? "Ativo" : "Pausado" }}
              </span>
            </div>
          </template>
        </Column>

        <!-- Size -->
        <Column header="Tamanho" style="width: 110px">
          <template #body="{ data }">
            <span class="text-xs font-mono text-zinc-500 bg-black/20 px-2 py-1 rounded border border-white/5">
              {{ data.size }}
            </span>
          </template>
        </Column>

        <!-- Actions -->
        <Column header="" style="width: 220px" alignFrozen="right" frozen>
          <template #body="{ data }">
            <div class="flex items-center justify-end gap-1">
              <!-- Open CMS -->
              <Button
                icon="pi pi-pencil"
                size="small" text rounded
                class="!w-8 !h-8 text-slate-500 hover:text-[#6f942e] hover:bg-[#6f942e]/10"
                v-tooltip.top="'Abrir no CMS'"
                @click="openCms(data)"
              />
              <!-- Pause / Resume -->
              <Button
                :icon="data.status === 'running' ? 'pi pi-pause' : 'pi pi-play'"
                size="small" text rounded
                :class="['!w-8 !h-8', data.status === 'running' ? 'text-amber-500 hover:bg-amber-500/15' : 'text-[#6f942e] hover:bg-[#6f942e]/15']"
                v-tooltip.top="data.status === 'running' ? 'Pausar' : 'Ativar'"
                @click="handleToggle(data)"
              />
              <!-- Rename -->
              <Button
                icon="pi pi-tag"
                size="small" text rounded
                class="!w-8 !h-8 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10"
                v-tooltip.top="'Renomear'"
                @click="openRenameModal(data)"
              />
              <!-- Clone -->
              <Button
                icon="pi pi-copy"
                size="small" text rounded
                class="!w-8 !h-8 text-slate-500 hover:text-violet-400 hover:bg-violet-400/10"
                v-tooltip.top="'Clonar como base'"
                @click="() => { cloneForm.sourceId = data.id; cloneForm.name = ''; showCloneModal.value = true; }"
              />
              <!-- Delete -->
              <Button
                icon="pi pi-trash"
                size="small" text rounded
                class="!w-8 !h-8 text-slate-500 hover:text-red-500 hover:bg-red-500/15 ml-1"
                v-tooltip.top="'Apagar'"
                @click="confirmDelete(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- ─── Clone Modal ─────────────────────────────────── -->
    <Dialog
      v-model:visible="showCloneModal"
      modal
      :style="{ width: '30rem' }"
      class="!bg-[#0f1a13] !border-white/10"
    >
      <template #header>
        <div class="flex items-center gap-2 text-white font-black tracking-wider text-sm uppercase">
          <i class="pi pi-plus-circle text-[#6f942e]"></i>
          Novo Site
        </div>
      </template>

      <div class="flex flex-col gap-5 pt-2">
        <div class="flex flex-col gap-2">
          <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
            Nome do Novo Site
          </label>
          <InputText
            v-model="cloneForm.name"
            placeholder="ex: meu-novo-site"
            class="bg-[#0a0f0d] border border-white/10 text-white !focus:border-[#6f942e] w-full"
            @keyup.enter="handleClone"
            autofocus
          />
          <p class="text-[10px] text-zinc-600">Espaços são convertidos em hífens automaticamente.</p>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
            Clonar a partir de
          </label>
          <Select
            v-model="cloneForm.sourceId"
            :options="sites"
            optionLabel="name"
            optionValue="id"
            placeholder="Escolha um site base"
            class="bg-[#0a0f0d] border border-white/10 text-white w-full"
          >
            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="text-sm text-white">{{ option.name }}</span>
                <span class="text-[10px] text-zinc-500 font-mono">{{ option.id }}</span>
              </div>
            </template>
          </Select>
          <p class="text-[10px] text-zinc-600">
            Os ficheiros do site são copiados (sem node_modules). Execute <code class="text-zinc-400 bg-white/5 px-1 rounded">bun install</code> após criar.
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancelar"
          text
          class="text-slate-500 hover:text-white"
          @click="showCloneModal = false"
          :disabled="isCloning"
        />
        <Button
          label="Criar Site"
          icon="pi pi-check"
          :loading="isCloning"
          :disabled="!cloneForm.name.trim()"
          class="bg-[#6f942e] border-none text-black font-bold"
          @click="handleClone"
        />
      </template>
    </Dialog>

    <!-- ─── Rename Modal ────────────────────────────────── -->
    <Dialog
      v-model:visible="showRenameModal"
      modal
      :style="{ width: '32rem' }"
      class="!bg-[#0f1a13] !border-white/10"
    >
      <template #header>
        <div class="flex items-center gap-2 text-white font-black tracking-wider text-sm uppercase">
          <i class="pi pi-tag text-blue-400"></i>
          Editar Site — {{ renameTarget?.id }}
        </div>
      </template>

      <div class="flex flex-col gap-5 pt-2">
        <div class="flex flex-col gap-2">
          <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
            Nome de Exibição
          </label>
          <InputText
            v-model="renameForm.displayName"
            class="bg-[#0a0f0d] border border-white/10 text-white w-full"
            placeholder="Nome do site"
          />
          <p class="text-[10px] text-zinc-600">Atualiza o package.json e o ficheiro .env do site.</p>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
            ID / Pasta
          </label>
          <InputText
            v-model="renameForm.newId"
            class="bg-[#0a0f0d] border border-white/10 text-white w-full"
            placeholder="id-do-site"
          />
          <div v-if="renameIdChanged" class="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <i class="pi pi-exclamation-triangle text-amber-500 text-sm mt-0.5 shrink-0"></i>
            <p class="text-[10px] text-amber-400 leading-relaxed">
              Renomear o ID irá renomear a <strong>pasta sites/web/</strong> e o <strong>diretório storage/</strong>. O servidor do site precisa de ser reiniciado após esta operação.
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancelar"
          text
          class="text-slate-500 hover:text-white"
          @click="showRenameModal = false"
          :disabled="isRenaming"
        />
        <Button
          label="Guardar"
          icon="pi pi-check"
          :loading="isRenaming"
          class="bg-blue-600 border-none text-white font-bold hover:bg-blue-500"
          @click="handleRename"
        />
      </template>
    </Dialog>

    <!-- ─── Users Modal ─────────────────────────────────── -->
    <Dialog
      v-model:visible="showUsersModal"
      modal
      header="Gerir Utilizadores"
      :style="{ width: '36rem' }"
      class="!bg-[#0f1a13] !border-white/10"
    >
      <template #header>
        <div class="flex items-center gap-2 text-white font-black tracking-wider text-sm uppercase">
          <i class="pi pi-users text-[#6f942e]"></i>
          Gerir Utilizadores
        </div>
      </template>

      <div class="flex flex-col gap-6 pt-2">
        <!-- Users list -->
        <div class="flex flex-col gap-2">
          <p class="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">Utilizadores Ativos</p>
          <div
            v-for="user in users"
            :key="user.id"
            class="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-4 py-3"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-[#6f942e]/20 border border-[#6f942e]/30 flex items-center justify-center">
                <i class="pi pi-user text-[#6f942e] text-xs"></i>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">{{ user.username }}</p>
                <p class="text-[10px] text-zinc-500 font-mono uppercase">{{ user.role }}</p>
              </div>
            </div>
            <Button
              icon="pi pi-trash"
              size="small" text rounded
              class="!w-7 !h-7 text-slate-600 hover:text-red-500 hover:bg-red-500/10"
              @click="confirmDeleteUser(user)"
              :disabled="users.length <= 1"
            />
          </div>
          <p v-if="!users.length" class="text-xs text-zinc-600 text-center py-4">Nenhum utilizador encontrado.</p>
        </div>

        <!-- Add user form -->
        <div class="border-t border-white/5 pt-5">
          <p class="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Adicionar Utilizador</p>
          <div class="flex flex-col gap-3">
            <div class="flex gap-2">
              <InputText
                v-model="newUserForm.username"
                placeholder="Utilizador"
                class="bg-[#0a0f0d] border border-white/10 text-white flex-1"
              />
              <InputText
                v-model="newUserForm.password"
                type="password"
                placeholder="Password"
                class="bg-[#0a0f0d] border border-white/10 text-white flex-1"
              />
            </div>
            <Button
              label="Adicionar"
              icon="pi pi-user-plus"
              :loading="isAddingUser"
              :disabled="!newUserForm.username.trim() || !newUserForm.password.trim()"
              class="bg-[#6f942e] border-none text-black font-bold self-start"
              @click="handleAddUser"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Fechar" text class="text-slate-400 hover:text-white" @click="showUsersModal = false" />
      </template>
    </Dialog>
  </div>
</template>
