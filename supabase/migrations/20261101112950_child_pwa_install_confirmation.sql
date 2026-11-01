-- Keep guardian-visible PWA setup status separate from QR redemption.
-- A redeemed pairing only means the link has opened on a child device.
-- App installation is confirmed by the child-access API after standalone launch
-- or the browser/OS appinstalled event, authenticated with the device capability.
alter table public.child_device_sessions
 add column if not exists installed_at timestamptz;

comment on column public.child_device_sessions.installed_at is
 'Set only by child-access with a valid active device capability after the PWA launches from the home screen or OS install event. QR redemption alone does not populate this field.';

notify pgrst, 'reload schema';
