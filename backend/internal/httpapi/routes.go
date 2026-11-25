package httpapi

import "net/http"

// routes lists every endpoint. Role names after a handler restrict who may call it;
// finer rules (own bookings only, change deadlines) live in the app package.
func (s *server) routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/auth/signup", s.signUp)
	mux.HandleFunc("POST /api/auth/verify", s.verify)
	mux.HandleFunc("POST /api/auth/resend-verification", s.resendVerification)
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("POST /api/auth/forgot", s.forgot)
	mux.HandleFunc("POST /api/auth/reset", s.reset)
	mux.HandleFunc("GET /api/auth/me", s.authed(s.me))
	mux.HandleFunc("GET /api/me/notifications", s.authed(s.myNotifications, "client"))
	mux.HandleFunc("POST /api/me/notifications/{id}/read", s.authed(s.readMyNotification, "client"))
	mux.HandleFunc("POST /api/me/notifications/{id}/dismiss", s.authed(s.dismissMyNotification, "client"))
	mux.HandleFunc("GET /api/me/residence", s.authed(s.myResidence, "client"))
	mux.HandleFunc("PUT /api/me/residence", s.authed(s.updateResidence, "client"))
	mux.HandleFunc("POST /api/unsubscribe", s.unsubscribe)

	mux.HandleFunc("GET /api/catalog", s.catalog)
	mux.HandleFunc("GET /api/psychologists", s.searchPsychologists)
	mux.HandleFunc("GET /api/psychologists/{id}", s.psychologist)
	mux.HandleFunc("GET /api/psychologists/{id}/slots", s.slots)

	mux.HandleFunc("POST /api/bookings", s.authed(s.book, "client", "admin"))
	mux.HandleFunc("GET /api/me/bookings", s.authed(s.myBookings, "client"))
	mux.HandleFunc("POST /api/bookings/{id}/reschedule", s.authed(s.reschedule))
	mux.HandleFunc("POST /api/bookings/{id}/cancel", s.authed(s.cancel))
	mux.HandleFunc("POST /api/bookings/{id}/attendance", s.authed(s.attendance))

	mux.HandleFunc("GET /api/psy/schedule", s.authed(s.mySchedule, "psychologist"))
	mux.HandleFunc("GET /api/psy/hours", s.authed(s.getHours, "psychologist"))
	mux.HandleFunc("PUT /api/psy/hours", s.authed(s.putHours, "psychologist"))
	mux.HandleFunc("POST /api/psy/unavailability", s.authed(s.addUnavailability, "psychologist"))

	s.adminRoutes(mux)
	s.urgentRoutes(mux)
}
