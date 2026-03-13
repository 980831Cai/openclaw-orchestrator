import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAIN_CONTENT_COLLAPSED_OFFSET,
  MAIN_CONTENT_EXPANDED_OFFSET,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from '../src/components/layout/layout-shell.ts'

test('main content offset matches sidebar width in collapsed state', () => {
  assert.equal(MAIN_CONTENT_COLLAPSED_OFFSET, SIDEBAR_COLLAPSED_WIDTH)
})

test('main content offset matches sidebar width in expanded state', () => {
  assert.equal(MAIN_CONTENT_EXPANDED_OFFSET, SIDEBAR_EXPANDED_WIDTH)
})
