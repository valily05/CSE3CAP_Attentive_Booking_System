package booking

import (
	"fmt"
	"io"
)

// codeAlphabet leaves out 0/O, 1/I/L so codes can be read over the phone.
const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

// NewCode returns a short booking code such as ATT-7K2Q, drawing randomness
// from r (crypto/rand.Reader in production).
func NewCode(r io.Reader) (string, error) {
	const n = len(codeAlphabet)
	limit := byte(256 - 256%n) // reject bytes >= limit to avoid modulo bias
	out := make([]byte, 0, 4)
	buf := make([]byte, 1)
	for len(out) < 4 {
		if _, err := io.ReadFull(r, buf); err != nil {
			return "", fmt.Errorf("booking code: %w", err)
		}
		if buf[0] >= limit {
			continue
		}
		out = append(out, codeAlphabet[int(buf[0])%n])
	}
	return "ATT-" + string(out), nil
}
