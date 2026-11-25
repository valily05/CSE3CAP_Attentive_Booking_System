package store

import "context"

// UpdateClientResidence changes only the authenticated client's residence fields.
func (s *Store) UpdateClientResidence(ctx context.Context, id, country, otherCountry, city, zone string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE client SET residence_country=$2,residence_other_country=$3,residence_city=$4,residence_timezone=$5 WHERE id=$1`, id, country, otherCountry, city, zone)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrNotFound
	}
	return nil
}
