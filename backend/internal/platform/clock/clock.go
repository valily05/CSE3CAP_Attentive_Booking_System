// Package clock is the only place allowed to read the wall clock.
package clock

import (
	"sync"
	"time"
)

// Clock tells the time.
type Clock interface{ Now() time.Time }

// System is the real clock.
type System struct{}

// Now returns the current time.
func (System) Now() time.Time { return time.Now() }

// Manual is a clock tests can set and advance.
type Manual struct {
	mu sync.Mutex
	t  time.Time
}

// NewManual starts a manual clock at t.
func NewManual(t time.Time) *Manual { return &Manual{t: t} }

// Now returns the manual time.
func (m *Manual) Now() time.Time { m.mu.Lock(); defer m.mu.Unlock(); return m.t }

// Set moves the clock to t.
func (m *Manual) Set(t time.Time) { m.mu.Lock(); defer m.mu.Unlock(); m.t = t }

// Advance moves the clock forward.
func (m *Manual) Advance(d time.Duration) { m.mu.Lock(); defer m.mu.Unlock(); m.t = m.t.Add(d) }
