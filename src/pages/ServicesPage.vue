<template>
  <q-page class="services-page q-pa-md">
    <div class="svc-shell">
      <!-- Hero: the two shipped designs share this block, the theme flips its voice -->
      <div class="svc-hero">
        <h1>
          {{ $t("services.heroTitle") }}<br /><em>{{
            $t("services.heroAccent")
          }}</em>
        </h1>
        <p>{{ $t("services.heroSubtitle") }}</p>
        <div class="svc-rate">
          <b>{{ formatSats(2900) }}</b
          >{{ $t("services.rateSuffix") }}
        </div>
      </div>

      <q-banner v-if="error" rounded class="bg-orange-1 text-orange-10 q-mt-md">
        {{ $t("services.catalogUnavailable") }}
      </q-banner>

      <q-spinner
        v-if="loading"
        color="primary"
        size="2em"
        class="q-my-xl block q-mx-auto"
      />

      <div v-else-if="filteredServices.length" class="svc-list">
        <!-- A list row IS the tap target: no per-row button to mis-tap. -->
        <div
          v-for="service in filteredServices"
          :key="service.id"
          class="svc-card"
          :class="{ 'svc-unavailable': !service.available }"
          :data-testid="'service-card-' + service.id"
          role="button"
          :tabindex="service.available ? 0 : -1"
          :aria-disabled="!service.available"
          @click="service.available && openService(service)"
          @keydown.enter="service.available && openService(service)"
        >
          <div class="svc-head" :data-testid="'service-row-' + service.id">
            <div class="svc-ic">{{ service.icon }}</div>
            <div>
              <div class="svc-name">{{ service.name }}</div>
              <div class="svc-sub">{{ service.description }}</div>
            </div>
          </div>

          <!-- sats first, fiat second and smaller -->
          <div class="svc-price">
            <span class="sats" data-testid="price-sats">{{
              formatSats(service.price)
            }}</span>
            <span class="fiat" data-testid="price-fiat">{{
              service.fiat
            }}</span>
          </div>

          <div
            v-if="!service.available"
            class="svc-why"
            data-testid="unavailable-reason"
          >
            {{ service.unavailableReason }}
          </div>
          <div v-else class="svc-go">{{ $t("services.writeMessage") }} →</div>
        </div>
      </div>

      <div v-else class="svc-card svc-unavailable q-pa-lg text-center">
        {{ $t("services.empty") }}
      </div>

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
            <span class="sats" data-testid="confirm-amount">{{
              formatSats(payAmount)
            }}</span>
            <span class="fiat">{{ selected && selected.fiat }}</span>
          </div>

          <div class="svc-steps">
            <span class="step" :class="{ on: step === 'compose' }">{{
              $t("services.stepCompose")
            }}</span>
            <span class="sep" />
            <span class="step" :class="{ on: step === 'pay' }">{{
              $t("services.stepPay")
            }}</span>
            <span class="sep" />
            <span class="step" :class="{ on: step === 'sent' }">{{
              $t("services.stepSend")
            }}</span>
          </div>

          <div v-if="step === 'compose'" data-testid="compose-step">
            <q-input
              v-model="recipient"
              outlined
              dense
              :label="$t('services.toNumber')"
              inputmode="tel"
              class="q-mt-md"
            />
            <q-input
              v-model="message"
              outlined
              dense
              type="textarea"
              :label="$t('services.messageLabel')"
              class="q-mt-sm"
            />
            <div
              class="text-caption text-right q-mt-xs"
              style="color: var(--svc-fg-faint)"
            >
              {{ message.length }} / 160 {{ $t("services.charsIncluded") }}
            </div>
          </div>

          <div v-else-if="step === 'pay'" data-testid="pay-step">
            <div class="svc-amount" data-testid="pay-amount">
              {{ $t("services.payAmount") }}
              <b>{{ payAmountLabel }}</b>
            </div>
            <div class="svc-escrow">
              {{ $t("services.payTo") }}
              <b data-testid="pay-mint">{{ serviceMint }}</b>
            </div>
            <!-- A refusal is data: show the machine reason and never hide it. -->
            <div v-if="payErrorKey" class="svc-warn" data-testid="pay-error">
              <div>{{ $t(payErrorKey) }}</div>
              <div
                v-if="payErrorReason"
                class="svc-err-reason"
                data-testid="pay-error-reason"
              >
                {{ payErrorReason
                }}<span v-if="payErrorDetail"> — {{ payErrorDetail }}</span>
              </div>
            </div>
          </div>

          <div v-else data-testid="sent-step">
            <div
              class="svc-result"
              :class="
                result && result.accepted ? 'svc-result-ok' : 'svc-result-bad'
              "
              data-testid="send-result"
            >
              {{
                result && result.accepted
                  ? $t("services.resultAccepted")
                  : $t("services.resultNotAccepted")
              }}
            </div>
            <div v-if="result && result.id" class="svc-kv">
              <b>{{ $t("services.resultId") }}</b>
              <span data-testid="result-id">{{ result.id }}</span>
            </div>
            <div v-if="result && result.status" class="svc-kv">
              <b>{{ $t("services.resultStatus") }}</b>
              <span data-testid="result-status">{{ result.status }}</span>
            </div>
            <div
              v-if="result && result.refunded"
              class="svc-kv"
              data-testid="result-refunded"
            >
              <b>{{ $t("services.resultRefunded") }}</b>
            </div>
            <div
              v-if="result && !result.accepted && result.errorKey"
              class="svc-warn"
              data-testid="result-error"
            >
              {{ $t(result.errorKey) }}
            </div>
            <!-- THE honesty caveat: always shown, never conditional. -->
            <div class="svc-warn" data-testid="no-receipts">
              {{ $t("services.noReceipts") }}
            </div>
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
          <button
            v-else-if="step === 'pay'"
            class="svc-cta"
            data-testid="confirm-pay-btn"
            :disabled="paying"
            @click="payNow"
          >
            {{ paying ? $t("services.paying") : $t("services.payFromWallet") }}
          </button>
          <button
            v-else
            class="svc-ghost"
            data-testid="retry-btn"
            @click="retry"
          >
            {{ $t("services.sendAnother") }}
          </button>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { CvmClient } from "src/js/cvm";
import {
  FALLBACK_PRICE_SATS,
  buildSmsSendArgs,
  npubToHex,
  payForSms,
  readCvmResult,
  SERVICE_MINT_URL,
  SERVICE_NPUB,
  SERVICE_RELAYS,
  type PaidSendResult,
  type PayErrorKey,
} from "src/js/cvmPayment";
import { useWalletStore, type InvoiceHistory } from "src/stores/wallet";
import { useMintsStore } from "src/stores/mints";
import { useNostrStore } from "src/stores/nostr";
import { PaymentMethod } from "src/stores/walletTypes";

type CatalogService = {
  id: string;
  name: string;
  description: string;
  announcement: string;
  price: number;
  /** Optional historical ceiling — the pay step never pays above it. */
  maxPrice?: number;
  fiat: string;
  available: boolean;
  unavailableReason?: string;
  npub?: string;
  icon: string;
};

type FlowStep = "compose" | "pay" | "sent";

export default defineComponent({
  name: "ServicesPage",
  mixins: [windowMixin],
  data() {
    return {
      loading: true,
      error: false,
      selected: null as CatalogService | null,
      flowOpen: false,
      step: "compose" as FlowStep,
      recipient: "",
      message: "",
      services: [] as CatalogService[],
      paying: false,
      result: null as PaidSendResult | null,
      payErrorKey: "" as PayErrorKey | "",
      payErrorReason: "",
      payErrorDetail: "",
    };
  },
  computed: {
    /** Sats the user will pay for this send (live price when known). */
    payAmountLabel(): string {
      const live = this.result?.priceSats;
      const amount = live && live > 0 ? live : this.selected?.price ?? 0;
      return `${amount} sats`;
    },
    /** The mint the service takes payment at (one of the wallet's mints). */
    serviceMint(): string {
      return SERVICE_MINT_URL;
    },
    filteredServices(): CatalogService[] {
      return this.services;
    },
    /*
     * The sats figure the button acts on. Starts at the catalogue price (so the
     * dialog is honest before the rail is contacted) and is tightened to the
     * rail's live answer once it arrives. Never above the service's ceiling.
     */
    payAmount(): number {
      const catalog = this.selected ? this.selected.price : 0;
      const live = this.result?.priceSats;
      const amount = live && live > 0 ? live : catalog || FALLBACK_PRICE_SATS;
      const ceiling = this.selected?.maxPrice;
      if (ceiling && amount > ceiling) return ceiling;
      return amount;
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
      this.resetPaymentState();
      this.flowOpen = true;
    },
    closeFlow() {
      this.flowOpen = false;
      this.selected = null;
      this.recipient = "";
      this.message = "";
      this.step = "compose";
      this.resetPaymentState();
    },
    resetPaymentState() {
      this.result = null;
      this.payErrorKey = "";
      this.payErrorReason = "";
      this.payErrorDetail = "";
    },
    /*
     * Back to compose, keeping the typed number + message so a refused send can
     * be corrected without retyping. Clears the previous verdict.
     */
    retry() {
      this.resetPaymentState();
      this.step = "compose";
    },
    /** The CVM this service is addressed to: the catalogue npub, as hex. */
    servicePubkey(): string {
      return npubToHex(this.selected?.npub || SERVICE_NPUB);
    },
    /** A fresh transport per attempt — the client closes its pool in `call`. */
    makeClient(): CvmClient {
      const nostrStore = useNostrStore();
      // The CVM signer is the wallet-seed keypair, derived at boot by
      // `nostr.initWalletSeedPrivateKeySigner()`. Without a seed there is no
      // key to sign the gift wrap with, and the pay step is refused earlier.
      const secretKey = nostrStore.seedSignerPrivateKey;
      if (!secretKey) {
        throw new Error("no wallet seed signer");
      }
      return new CvmClient({
        relays: SERVICE_RELAYS,
        serverPubkey: this.servicePubkey(),
        secretKey,
      });
    },
    /*
     * The pay step. Order matters and is enforced in `payForSms`:
     * seed/mint check -> live price -> escrow-mint check -> mint the token ->
     * send it. Nothing is minted until the first three pass, so a refusal
     * cannot cost the user sats.
     */
    async payNow() {
      if (this.paying) return;
      if (!this.selected) return;
      this.paying = true;
      this.resetPaymentState();

      const wallet = useWalletStore();
      const mints = useMintsStore();
      let client: CvmClient;
      try {
        client = this.makeClient();
      } catch (error: any) {
        // No seed signer: refuse locally, mint nothing, send nothing.
        this.result = this.localFailure(error);
        this.payErrorKey = this.result.errorKey as PayErrorKey;
        this.payErrorDetail = this.result.detail ?? "";
        this.step = "sent";
        this.paying = false;
        return;
      }

      try {
        const outcome = await payForSms({
          client,
          mintToken: ({ sats }) => wallet.mintPaymentToken(sats),
          to: this.recipient.trim(),
          body: this.message,
          wallet: {
            hasSeed: wallet.hasSeed && !!useNostrStore().seedSignerPrivateKey,
            mintsCount: mints.mints.length,
          },
          connectedMintUrls: mints.mints.map((m) => m.url),
          serviceMintUrl: SERVICE_MINT_URL,
        });

        this.result = outcome;
        if (!outcome.ok) {
          this.payErrorKey = (outcome.errorKey ??
            "services.payErrors.generic") as PayErrorKey;
          this.payErrorReason = outcome.reason ?? "";
          this.payErrorDetail = outcome.detail ?? "";
        } else {
          // A send the rail accepted belongs in the wallet's history, so the
          // sats leaving the wallet are not silent. Best-effort: a history
          // write must never turn a real send into a visible failure.
          await this.recordPaidSend(outcome);
        }

        this.step = "sent";
      } catch (error: any) {
        // A local failure that never reached the wire (mint refused, etc.).
        this.result = this.localFailure(error);
        this.payErrorKey = this.result.errorKey as PayErrorKey;
        this.payErrorReason = this.result.reason ?? "";
        this.payErrorDetail = this.result.detail ?? "";
        this.step = "sent";
      } finally {
        this.paying = false;
        try {
          client.close();
        } catch {
          /* the pool may already be closed by `call` */
        }
      }
    },
    /**
     * A failure that never reached the wire, shaped like a real result so the
     * result template renders it without a special case.
     */
    localFailure(error: any): PaidSendResult {
      const raw = String(error?.message ?? error);
      const reason = /balance|funds|not enough/i.test(raw)
        ? "insufficient_funds"
        : "local_error";
      return readCvmResult({
        ok: false,
        error: { reason, hint: raw },
      });
    },
    /**
     * Record an accepted send in the wallet's payment history, so spending is
     * not silent. Best-effort: a history write must never turn a real send into
     * a visible failure.
     */
    async recordPaidSend(result: PaidSendResult) {
      if (!result.accepted) return;
      try {
        const wallet = useWalletStore();
        const invoice: InvoiceHistory = {
          amount: -(result.priceSats ?? this.selected?.price ?? 0),
          request: JSON.stringify(
            buildSmsSendArgs(this.recipient.trim(), this.message)
          ),
          quote: result.id ?? "",
          memo: `${this.selected?.name ?? "Service"} SMS ${
            result.id ?? ""
          }`.trim(),
          type: PaymentMethod.Bolt11,
          id: result.id,
          date: new Date().toISOString(),
          status: "paid",
          mint: SERVICE_MINT_URL,
          unit: "sat",
          label: result.status,
          paidDate: new Date().toISOString(),
          direction: "melt",
        };
        await wallet.addPaymentHistory(invoice);
      } catch (error) {
        console.error("Could not record the paid send in history", error);
      }
    },
  },
  async mounted() {
    try {
      const response = await fetch("/catalog.json");
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = await response.json();
      const allowlist = new Set(catalog.allowlist || []);
      this.services = (catalog.entries || [])
        .filter(
          (entry: any) =>
            !entry.npub || allowlist.size === 0 || allowlist.has(entry.npub)
        )
        .map((entry: any) => {
          const unavailable =
            entry.available === false || entry.transport === "whatsapp";
          return {
            id: entry.id || entry.npub || entry.name,
            name: entry.name || entry.title || "Unnamed service",
            description: entry.description || entry.summary || "",
            announcement: entry.announcement || entry.description || "",
            price: Number(entry.price_sats || entry.price || 0),
            maxPrice: entry.max_price_sats
              ? Number(entry.max_price_sats)
              : undefined,
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
