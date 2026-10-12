<template>
  <q-page class="services-page q-pa-md">
    <div class="svc-shell">
      <!-- Hero: the two shipped designs share this block, the theme flips its voice -->
      <div class="svc-hero">
        <h1>{{ $t("services.heroTitle") }}<br /><em>{{ $t("services.heroAccent") }}</em></h1>
        <p>{{ $t("services.heroSubtitle") }}</p>
        <div class="svc-rate">
          <b>{{ formatSats(2900) }}</b>{{ $t("services.rateSuffix") }}
        </div>
      </div>

      <q-banner v-if="error" rounded class="bg-orange-1 text-orange-10 q-mt-md">
        {{ $t("services.catalogUnavailable") }}
      </q-banner>

      <q-spinner v-if="loading" color="primary" size="2em" class="q-my-xl block q-mx-auto" />

      <div v-else-if="filteredServices.length" class="svc-list">
        <!-- A list row IS the tap target: no per-row button to mis-tap. -->
        <div
          v-for="service in filteredServices"
          :key="service.id"
          class="svc-card"
          :class="{ 'svc-unavailable': !service.available }"
          :data-testid="`service-card-${service.id}`"
          role="button"
          :tabindex="service.available ? 0 : -1"
          :aria-disabled="!service.available"
          @click="service.available && openService(service)"
          @keydown.enter="service.available && openService(service)"
        >
          <div
            class="svc-head"
            :data-testid="`service-row-${service.id}`"
          >
            <div class="svc-ic">{{ service.icon }}</div>
            <div>
              <div class="svc-name">{{ service.name }}</div>
              <div class="svc-sub">{{ service.description }}</div>
            </div>
          </div>

          <!-- sats first, fiat second and smaller -->
          <div class="svc-price">
            <span class="sats" :data-testid="`price-sats`">{{ formatSats(service.price) }}</span>
            <span class="fiat" :data-testid="`price-fiat`">{{ service.fiat }}</span>
          </div>

          <div v-if="!service.available" class="svc-why" :data-testid="`unavailable-reason`">
            {{ service.unavailableReason }}
          </div>
          <div v-else class="svc-go">{{ $t("services.writeMessage") }} →</div>
        </div>
      </div>

      <div v-else class="svc-card svc-unavailable q-pa-lg text-center">{{ $t("services.empty") }}</div>

      <!-- Trust chip: cheap, high value, stays out of the way -->
      <div class="svc-trust">
        {{ $t("services.trustNoAccount") }} · {{ $t("services.trustNoData") }} ·
        <b>{{ $t("services.trustPayPerMessage") }}</b>
      </div>

      <details class="svc-details">
        <summary>{{ $t("services.details") }}</summary>
        <p>{{ $t("services.detailsBody") }}</p>
      </details>
    </div>

    <!-- Pay flow: compose -> pay -> sent, one dialog, one primary action per step -->
    <q-dialog v-model="flowOpen">
      <q-card class="svc-dialog">
        <q-card-section data-testid="confirm-dialog">
          <div class="svc-dialog-title">{{ selected && selected.name }}</div>
          <div class="svc-amount">
            <span class="sats" data-testid="confirm-amount">{{ formatSats(selected && selected.price) }}</span>
            <span class="fiat">{{ selected && selected.fiat }}</span>
          </div>

          <div class="svc-steps">
            <span class="step on">{{ $t("services.stepCompose") }}</span>
            <span class="sep" />
            <span class="step">{{ $t("services.stepPay") }}</span>
            <span class="sep" />
            <span class="step">{{ $t("services.stepSend") }}</span>
          </div>

          <div v-if="step === 'compose'" data-testid="compose-step">
            <q-input v-model="recipient" outlined dense :label="$t('services.toNumber')" inputmode="tel" class="q-mt-md" />
            <q-input v-model="message" outlined dense type="textarea" :label="$t('services.messageLabel')" class="q-mt-sm" />
            <div class="text-caption text-right q-mt-xs" style="color: var(--svc-fg-faint)">
              {{ message.length }} / 160 {{ $t("services.charsIncluded") }}
            </div>
          </div>

          <div v-else-if="step === 'pay'" data-testid="pay-step">
            <div class="svc-qr">[ {{ $t("services.qrPlaceholder") }} ]</div>
            <div class="svc-escrow">
              {{ $t("services.escrowHeld") }} <b>{{ $t("services.escrowClaimed") }}</b>
            </div>
          </div>

          <div v-else data-testid="sent-step">
            <div class="svc-warn">{{ $t("services.noReceipts") }}</div>
          </div>
        </q-card-section>

        <q-card-actions class="q-px-md q-pb-md">
          <button
            v-if="step === 'compose'"
            class="svc-cta"
            data-testid="pay-btn"
            :disabled="!recipient.trim() || !message.trim()"
            @click="step = 'pay'"
          >
            {{ $t("services.continueToPayment") }}
          </button>
          <button v-else-if="step === 'pay'" class="svc-cta" data-testid="confirm-pay-btn" @click="step = 'sent'">
            {{ $t("services.payFromWallet") }}
          </button>
          <button v-else class="svc-ghost" @click="closeFlow">{{ $t("services.sendAnother") }}</button>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Honest state of the unbuilt half: payment is not wired end-to-end yet. -->
    <q-dialog v-model="paymentNotice">
      <q-card class="svc-dialog">
        <q-card-section class="text-body1">{{ $t("services.notWired") }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="$t('global.actions.close.label')" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";

type CatalogService = {
  id: string;
  name: string;
  description: string;
  announcement: string;
  price: number;
  fiat: string;
  available: boolean;
  unavailableReason?: string;
  npub?: string;
  icon: string;
};

type FlowStep = "compose" | "pay" | "sent";

export default defineComponent({
  name: "ServicesPage",
  data() {
    return {
      loading: true,
      error: false,
      selected: null as CatalogService | null,
      flowOpen: false,
      step: "compose" as FlowStep,
      recipient: "",
      message: "",
      paymentNotice: false,
      services: [] as CatalogService[],
    };
  },
  computed: {
    filteredServices(): CatalogService[] {
      return this.services;
    },
  },
  methods: {
    /* sats first, grouped for legibility (2 900 -> "2,900") */
    formatSats(value: number | null | undefined): string {
      const n = Number(value || 0);
      return n.toLocaleString("en-US");
    },
    openService(service: CatalogService) {
      this.selected = service;
      this.step = "compose";
      this.flowOpen = true;
    },
    closeFlow() {
      this.flowOpen = false;
      this.selected = null;
      this.recipient = "";
      this.message = "";
      this.step = "compose";
    },
  },
  async mounted() {
    try {
      const response = await fetch("/catalog.json");
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = await response.json();
      const allowlist = new Set(catalog.allowlist || []);
      this.services = (catalog.entries || [])
        .filter((entry: any) => !entry.npub || allowlist.size === 0 || allowlist.has(entry.npub))
        .map((entry: any) => {
          const unavailable = entry.available === false || entry.transport === "whatsapp";
          return {
            id: entry.id || entry.npub || entry.name,
            name: entry.name || entry.title || "Unnamed service",
            description: entry.description || entry.summary || "",
            announcement: entry.announcement || entry.description || "",
            price: Number(entry.price_sats || entry.price || 0),
            fiat: entry.fiat || "",
            available: !unavailable,
            unavailableReason: unavailable
              ? entry.unavailableReason ||
                (entry.transport === "whatsapp"
                  ? "The WhatsApp rail is not connected in this release, so no payment can be taken."
                  : "")
              : "",
            npub: entry.npub,
            icon: entry.transport === "whatsapp" ? "💬" : "✉️",
          };
        });
    } catch (_error) {
      this.error = true;
    } finally {
      this.loading = false;
    }
  },
});
</script>
