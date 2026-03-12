/**
 * Settings-related type definitions
 */

export interface AvailableModel {
  /** Full model ID in provider/model-id format */
  id: string
  /** Display name */
  name: string
  /** Short description */
  desc?: string
  /** Whether the provider API key is configured */
  available: boolean
  /** Source: 'common' (from common list) or 'used' (used by agents) */
  source?: 'common' | 'used'
}

export interface ProviderWithModels {
  id: string
  name: string
  icon: string
  /** Whether this provider has API key configured */
  configured: boolean
  /** List of available models for this provider */
  models: AvailableModel[]
}

export interface CustomModel {
  id: string
  provider: string
  name: string
  available: boolean
}

export interface AvailableModelsResponse {
  /** List of providers with their models */
  providers: ProviderWithModels[]
  /** Global default model from agents.defaults.model.primary */
  defaultModel: string | null
  /** Custom models used by agents but not from known providers */
  customModels: CustomModel[]
}
