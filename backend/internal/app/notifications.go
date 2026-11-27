package app

import (
	"careconnect/internal/store"
	"context"
)

func (a *App) MyNotifications(ctx context.Context, actor Actor) ([]store.AccountNotification, error) {
	if actor.Role != "client" {
		return nil, ErrForbidden
	}
	return a.store.AccountNotifications(ctx, actor.UserID)
}
func (a *App) ReadMyNotification(ctx context.Context, actor Actor, id string) error {
	if actor.Role != "client" {
		return ErrForbidden
	}
	return a.store.ReadAccountNotification(ctx, actor.UserID, id, a.clock.Now())
}
func (a *App) DismissMyNotification(ctx context.Context, actor Actor, id string) error {
	if actor.Role != "client" {
		return ErrForbidden
	}
	return a.store.DismissAccountNotification(ctx, actor.UserID, id, a.clock.Now())
}

func (a *App) ReadAllMyNotifications(ctx context.Context, actor Actor) error {
	if actor.Role != "client" {
		return ErrForbidden
	}
	return a.store.ReadAllAccountNotifications(ctx, actor.UserID, a.clock.Now())
}
