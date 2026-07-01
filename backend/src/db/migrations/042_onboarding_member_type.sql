-- Member type so non-roster people (employees, comp/free-month, PIF, reciprocal)
-- can be added manually to reconcile their bookings WITHOUT counting toward the
-- active-member number or triggering onboarding / re-engagement touches.
-- 'member' = regular EFT member from the SAIL roster (the only type that counts).
alter table onboarding_members add column if not exists member_type text default 'member';
