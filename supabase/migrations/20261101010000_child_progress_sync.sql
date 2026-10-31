-- Child-device progress: parent and child update the same homework row.
-- Parents keep existing Auth/RLS policies. A child has only a hashed QR
-- session and can write through the server-side, single-child API.
alter table public.homework_progress
  alter column updated_by drop not null;
alter table public.homework_progress
  add column if not exists updated_by_device uuid
    references public.child_device_sessions(id) on delete set null;

create or replace function private.stamp_homework()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
    new.updated_by_device = null;
  else
    if new.updated_by_device is null then
      raise exception 'Missing device attribution for homework update';
    end if;
    new.updated_by = null;
  end if;
  return new;
end;
$$;

grant select, insert, update on public.homework_progress to service_role;
comment on column public.homework_progress.updated_by_device is
 'Device that last marked homework; parent edits use updated_by instead';
notify pgrst, 'reload schema';
