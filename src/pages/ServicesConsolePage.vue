<template>
  <q-page class="q-pa-md">
    <div class="console-shell">
      <div class="row items-center justify-between q-mb-lg"><div><div class="text-h5 text-weight-bold">{{ $t("console.title") }}</div><div class="text-caption text-grey-7">{{ $t("console.subtitle") }}</div></div><q-btn flat icon="arrow_back" :label="$t('console.wallet')" to="/" /></div>
      <q-tabs v-model="tab" no-caps active-color="primary" class="q-mb-md"><q-tab name="queue" :label="$t('console.queue')" /><q-tab name="money" :label="$t('console.money')" /><q-tab name="services" :label="$t('console.services')" /></q-tabs>
      <q-tab-panels v-model="tab" animated>
        <q-tab-panel name="queue" class="q-px-none"><q-card v-for="item in queue" :key="item.id" flat bordered class="q-mb-sm"><q-card-section class="row items-center justify-between"><div><div class="text-subtitle1 text-weight-bold">{{ item.name }}</div><div class="text-caption text-grey-7">{{ item.id }}</div></div><q-chip dense :color="item.age > 10 ? 'orange' : 'grey-3'" :text-color="item.age > 10 ? 'white' : 'grey-9'">{{ item.age }} min</q-chip></q-card-section></q-card><q-card v-if="!queue.length" flat bordered class="q-pa-lg text-center text-grey-7">{{ $t("console.empty") }}</q-card></q-tab-panel>
        <q-tab-panel name="money" class="q-px-none"><q-card flat bordered><q-card-section><div class="text-caption text-grey-7">{{ $t("console.pending") }}</div><div class="text-h4 text-weight-bold">0 sats</div></q-card-section><q-separator /><q-card-section class="bg-orange-1"><div class="text-subtitle1 text-weight-bold">{{ $t("console.refunds") }}</div><div class="text-body2">{{ $t("console.refundsDescription") }}</div><div class="text-h6 q-mt-sm">0 sats</div></q-card-section></q-card></q-tab-panel>
        <q-tab-panel name="services" class="q-px-none"><q-card flat bordered><q-card-section><div class="text-subtitle1 text-weight-bold">{{ $t("console.announceTitle") }}</div><q-input v-model="announcement" type="textarea" outlined class="q-mt-md" :placeholder="$t('console.announcePlaceholder')" /><q-btn class="q-mt-md" color="primary" :label="$t('console.save')" @click="saved = true" /><q-banner v-if="saved" class="bg-green-1 text-green-10 q-mt-md">{{ $t("console.saved") }}</q-banner></q-card-section></q-card></q-tab-panel>
      </q-tab-panels>
    </div>
  </q-page>
</template>
<script lang="ts">
import { defineComponent } from "vue";
export default defineComponent({ name: "ServicesConsolePage", data() { return { tab: "queue", announcement: "", saved: false, queue: [] as { id: string; name: string; age: number }[] }; } });
</script>
<style scoped>.console-shell { max-width: 720px; margin: 0 auto; }</style>
