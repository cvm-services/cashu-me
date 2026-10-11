<template>
  <q-page class="services-page q-pa-md">
    <div class="services-shell">
      <div class="row items-center justify-between q-mb-md">
        <div>
          <div class="text-h5 text-weight-bold">{{ $t("services.title") }}</div>
          <div class="text-caption text-grey-7">{{ $t("services.subtitle") }}</div>
        </div>
        <q-btn flat icon="arrow_back" :label="$t('services.wallet')" to="/" />
      </div>

      <q-input v-model="query" outlined dense clearable :placeholder="$t('services.search')" class="q-mb-md">
        <template #prepend><q-icon name="search" /></template>
      </q-input>

      <q-banner v-if="error" rounded class="bg-orange-1 text-orange-10 q-mb-md">{{ $t("services.catalogUnavailable") }}</q-banner>
      <q-spinner v-if="loading" color="primary" size="2em" class="q-my-xl block q-mx-auto" />
      <div v-else-if="filteredServices.length" class="q-gutter-md">
        <q-card v-for="service in filteredServices" :key="service.id" flat bordered :class="{ 'service-unavailable': !service.available }">
          <q-card-section>
            <div class="row items-start justify-between no-wrap">
              <div>
                <div class="text-subtitle1 text-weight-bold">{{ service.name }}</div>
                <div class="text-body2 text-grey-7 q-mt-xs">{{ service.description }}</div>
              </div>
              <q-badge v-if="!service.available" outline color="grey-7">{{ $t("services.unavailable") }}</q-badge>
            </div>
            <div class="q-mt-md">
              <div class="text-h6 text-weight-bold">{{ service.price }} sats</div>
              <div class="text-caption text-grey-7">{{ service.fiat || $t("services.fiatUnavailable") }}</div>
            </div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-if="service.available" color="primary" unelevated :label="$t('services.pay')" @click="selected = service" />
            <q-btn flat :label="$t('services.details')" @click="details = service" />
          </q-card-actions>
        </q-card>
      </div>
      <q-card v-else flat bordered class="q-pa-lg text-center text-grey-7">{{ $t("services.empty") }}</q-card>

      <q-card flat bordered class="q-mt-lg">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold">{{ $t("services.providerTitle") }}</div>
          <div class="text-body2 text-grey-7 q-mt-xs">{{ $t("services.providerDescription") }}</div>
          <q-btn outline color="primary" class="q-mt-md" :label="$t('services.requestAccess')" @click="accessRequest = true" />
        </q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="details">
      <q-card style="min-width: min(92vw, 420px)">
        <q-card-section><div class="text-h6">{{ details && details.name }}</div><p>{{ details && details.announcement }}</p></q-card-section>
        <q-card-actions align="right"><q-btn flat :label="$t('global.actions.close.label')" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="selected">
      <q-card style="min-width: min(92vw, 420px)">
        <q-card-section>
          <div class="text-h6">{{ $t("services.confirmTitle") }}</div>
          <div class="text-h6 text-weight-bold q-mt-md">{{ selected && selected.price }} sats</div>
          <div class="text-caption text-grey-7">{{ selected && selected.fiat }}</div>
          <q-banner class="bg-blue-1 text-blue-10 q-mt-md">{{ $t("services.paymentNotice") }}</q-banner>
        </q-card-section>
        <q-card-actions align="right"><q-btn flat :label="$t('global.actions.cancel.label')" v-close-popup /><q-btn color="primary" :label="$t('services.pay')" @click="paymentNotice = true" /></q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="paymentNotice"><q-card><q-card-section class="text-body1">{{ $t("services.notWired") }}</q-card-section><q-card-actions align="right"><q-btn flat :label="$t('global.actions.close.label')" v-close-popup /></q-card-actions></q-card></q-dialog>
    <q-dialog v-model="accessRequest">
      <q-card style="min-width: min(92vw, 420px)">
        <q-card-section>
          <div class="text-h6">{{ $t("services.requestAccessTitle") }}</div>
          <div class="text-body2 text-grey-7 q-mt-sm">{{ $t("services.requestAccessDescription") }}</div>
          <q-input v-model="providerNpub" outlined dense class="q-mt-md" :label="$t('services.providerNpub')" />
          <q-select v-model="accessState" outlined dense class="q-mt-md" :options="accessStates" :label="$t('services.accessState')" />
          <q-banner class="bg-blue-1 text-blue-10 q-mt-md">{{ $t("services.requestSignedNotice") }}</q-banner>
        </q-card-section>
        <q-card-actions align="right"><q-btn flat :label="$t('global.actions.cancel.label')" v-close-popup /><q-btn color="primary" :disable="!providerNpub.trim()" :label="$t('services.submitRequest')" @click="submitAccessRequest" /></q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="requestSubmitted"><q-card><q-card-section class="text-body1">{{ $t("services.requestSaved") }}</q-card-section><q-card-actions align="right"><q-btn flat :label="$t('global.actions.close.label')" v-close-popup /></q-card-actions></q-card></q-dialog>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";

type CatalogService = { id: string; name: string; description: string; announcement: string; price: number; fiat: string; available: boolean; npub?: string };

export default defineComponent({
  name: "ServicesPage",
  data() {
    return { query: "", loading: true, error: false, details: null as CatalogService | null, selected: null as CatalogService | null, paymentNotice: false, accessRequest: false, requestSubmitted: false, providerNpub: "", accessState: "requested", accessStates: ["requested", "listed", "dismissed"], services: [] as CatalogService[] };
  },
  computed: {
    filteredServices(): CatalogService[] {
      const query = this.query.trim().toLowerCase();
      return this.services.filter((service) => !query || `${service.name} ${service.description}`.toLowerCase().includes(query));
    },
  },
  methods: {
    submitAccessRequest() {
      this.requestSubmitted = true;
      this.accessRequest = false;
    },
  },
  async mounted() {
    try {
      const response = await fetch("/catalog.json");
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = await response.json();
      const allowlist = new Set(catalog.allowlist || []);
      this.services = (catalog.entries || []).filter((entry: any) => !entry.npub || allowlist.size === 0 || allowlist.has(entry.npub)).map((entry: any) => ({
        id: entry.id || entry.npub || entry.name, name: entry.name || entry.title || "Unnamed service", description: entry.description || entry.summary || "", announcement: entry.announcement || entry.description || "", price: Number(entry.price_sats || entry.price || 0), fiat: entry.fiat || "", available: entry.available !== false && entry.transport !== "whatsapp", npub: entry.npub,
      }));
    } catch (_error) { this.error = true; }
    finally { this.loading = false; }
  },
});
</script>

<style scoped>
.services-shell { max-width: 680px; margin: 0 auto; }
.service-unavailable { opacity: .6; border-style: dashed; }
</style>
