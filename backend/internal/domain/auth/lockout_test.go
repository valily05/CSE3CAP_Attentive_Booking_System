package auth_test

import (
	"testing"
	"time"

	"careconnect/internal/domain/auth"
)

var t0 = time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC)

func failTimes(n int) auth.Attempts {
	var a auth.Attempts
	for i := range n {
		a = a.Failed(t0.Add(time.Duration(i) * time.Second))
	}
	return a
}

func TestLockout_FourWrongPasswordsDoNotLock(t *testing.T) {
	if failTimes(4).Locked(t0.Add(time.Minute)) {
		t.Fatal("locked after 4 failures, want unlocked")
	}
}

func TestLockout_FifthWrongPasswordLocksForFifteenMinutes(t *testing.T) {
	a := failTimes(5)
	if !a.Locked(t0.Add(14 * time.Minute)) {
		t.Fatal("not locked 14 minutes after 5th failure")
	}
	if a.Locked(t0.Add(15*time.Minute + 5*time.Second)) {
		t.Fatal("still locked after 15 minutes")
	}
}

func TestLockout_FreshStartAfterLockExpires(t *testing.T) {
	a := failTimes(5).Failed(t0.Add(20 * time.Minute))
	if a.Locked(t0.Add(20*time.Minute + time.Second)) {
		t.Fatal("one failure after an expired lock re-locked the account")
	}
}

func TestLockout_SuccessfulLoginClearsFailures(t *testing.T) {
	a := failTimes(4).Succeeded().Failed(t0.Add(time.Minute))
	if a.Locked(t0.Add(2 * time.Minute)) {
		t.Fatal("failures before a successful login still counted")
	}
}
