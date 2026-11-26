ALTER TABLE account_notification DROP CONSTRAINT account_notification_kind_check;
ALTER TABLE account_notification ADD CONSTRAINT account_notification_kind_check CHECK(kind IN ('welcome','waiting_slot','booking_rescheduled'));
