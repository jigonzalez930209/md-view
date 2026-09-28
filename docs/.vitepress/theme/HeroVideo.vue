<script setup lang="ts">
import { withBase } from 'vitepress';
</script>

<template>
  <!-- Muted + playsinline are what let browsers autoplay it. -->
  <video
    class="hero-video"
    :src="withBase('/media/md-view-demo.mp4')"
    :poster="withBase('/media/md-view-demo-poster.jpg')"
    autoplay
    loop
    muted
    playsinline
    preload="auto"
    aria-label="md-view in action: opening a folder, git change marks, Mermaid, KaTeX, themes and PDF export"
  />
</template>
