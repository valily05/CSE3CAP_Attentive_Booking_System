package httpapi

import (
	"net/http"

	"careconnect/internal/app"
	"careconnect/internal/domain/auth"
)

func (s *server) signUp(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name           string `json:"name"`
		Email          string `json:"email"`
		Phone          string `json:"phone"`
		Password       string `json:"password"`
		AgreedPrivacy  bool   `json:"agreedPrivacy"`
		CheckInConsent bool   `json:"checkInConsent"`
		Locale         string `json:"locale"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	err := s.app.SignUp(r.Context(), app.SignUpInput{Locale: in.Locale, SignUp: auth.SignUp{
		Name: in.Name, Email: in.Email, Phone: in.Phone, Password: in.Password,
		AgreedPrivacy: in.AgreedPrivacy, CheckInConsent: in.CheckInConsent,
	}})
	if err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

type tokenBody struct {
	Token    string `json:"token"`
	Password string `json:"password,omitempty"`
}

func (s *server) verify(w http.ResponseWriter, r *http.Request) {
	var in tokenBody
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.VerifyEmail(r.Context(), in.Token); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	token, err := s.app.Login(r.Context(), in.Email, in.Password)
	if err != nil {
		writeError(w, r, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: true,
		SameSite: http.SameSiteLaxMode, MaxAge: int(app.SessionLifetime.Seconds()),
	})
	s.authedAfterLogin(w, r, token)
}

func (s *server) authedAfterLogin(w http.ResponseWriter, r *http.Request, token string) {
	act, err := s.app.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, r, err)
		return
	}
	p, err := s.app.Me(r.Context(), act)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = s.app.Logout(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode})
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) forgot(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email  string `json:"email"`
		Locale string `json:"locale"`
	}
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.ForgotPassword(r.Context(), in.Email, in.Locale); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) reset(w http.ResponseWriter, r *http.Request) {
	var in tokenBody
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.ResetPassword(r.Context(), in.Token, in.Password); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) me(w http.ResponseWriter, r *http.Request) {
	p, err := s.app.Me(r.Context(), actorFrom(r.Context()))
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *server) unsubscribe(w http.ResponseWriter, r *http.Request) {
	var in tokenBody
	if err := decode(r, &in); err != nil {
		writeError(w, r, err)
		return
	}
	if err := s.app.Unsubscribe(r.Context(), in.Token); err != nil {
		writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
