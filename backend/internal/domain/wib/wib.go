// Package wib holds Western Indonesia Time (UTC+7, no daylight saving).
// Every time shown to a user or used in a business rule is WIB.
package wib

import "time"

// Zone is WIB. A fixed zone keeps the binary independent of the host's tzdata.
var Zone = time.FixedZone("WIB", 7*60*60)

// StartOfDay returns 00:00 WIB on the WIB calendar day containing t.
func StartOfDay(t time.Time) time.Time {
	y, m, d := t.In(Zone).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, Zone)
}
