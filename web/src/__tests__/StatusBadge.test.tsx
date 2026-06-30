import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBadge } from '../components/StatusBadge'

describe('StatusBadge', () => {
  it('INCOMPLETE → badge--pending class', () => {
    const { container } = render(<StatusBadge status="INCOMPLETE" />)
    expect(container.querySelector('.badge')).toHaveClass('badge--pending')
  })

  it('PENDING → badge--pending class', () => {
    const { container } = render(<StatusBadge status="PENDING" />)
    expect(container.querySelector('.badge')).toHaveClass('badge--pending')
  })

  it('ACTIVE → badge--active class', () => {
    const { container } = render(<StatusBadge status="ACTIVE" />)
    expect(container.querySelector('.badge')).toHaveClass('badge--active')
  })

  it('PAST_DUE → badge--warn class', () => {
    const { container } = render(<StatusBadge status="PAST_DUE" />)
    expect(container.querySelector('.badge')).toHaveClass('badge--warn')
  })

  it('CANCELED → badge--failed class', () => {
    const { container } = render(<StatusBadge status="CANCELED" />)
    expect(container.querySelector('.badge')).toHaveClass('badge--failed')
  })

  it('cancelAtPeriodEnd=true → shows cancel note alongside ACTIVE badge', () => {
    const { getByText } = render(<StatusBadge status="ACTIVE" cancelAtPeriodEnd />)
    expect(getByText('ACTIVE')).toBeInTheDocument()
    expect(getByText(/cancels at period end/i)).toBeInTheDocument()
  })

  it('cancelAtPeriodEnd=false → no cancel note', () => {
    const { queryByText } = render(<StatusBadge status="ACTIVE" cancelAtPeriodEnd={false} />)
    expect(queryByText(/cancels at period end/i)).not.toBeInTheDocument()
  })
})
