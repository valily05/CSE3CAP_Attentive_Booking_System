-- Keep only live waiting-list preferences; actual session bookings are untouched.
DELETE FROM session_waiting_list WHERE status IN ('removed','fulfilled');
ALTER TABLE session_waiting_list DROP CONSTRAINT session_waiting_list_status_check;
ALTER TABLE session_waiting_list ADD CONSTRAINT session_waiting_list_status_check CHECK(status='active');
