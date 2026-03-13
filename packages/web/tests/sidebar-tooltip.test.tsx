import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

import { Sidebar } from '../src/components/layout/Sidebar.tsx'

test('Sidebar renders without crashing when overall status tooltip is present', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar expanded />
      </MemoryRouter>,
    )
  })
})
