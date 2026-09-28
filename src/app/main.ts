import { createApp } from 'vue'
import App from './App.vue'
import { loadConfig } from './config'
import { installPlugins } from './plugins'
import ConfigErrorPage from '@/pages/ConfigErrorPage.vue'
import './styles.css'

const result = loadConfig()
if (result.ok) {
  installPlugins(createApp(App), result.config).mount('#app')
} else {
  createApp(ConfigErrorPage, { message: result.error }).mount('#app')
}
