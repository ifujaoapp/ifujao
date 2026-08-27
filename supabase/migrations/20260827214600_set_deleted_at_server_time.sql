-- Garante deleted_at = now() do SERVIDOR quando o pet passa de ativo
-- (deleted_at nulo) para apagado. Assim o cursor de deleção do sync não sofre
-- com o relógio do cliente (device com hora errada fazia deletes caírem "atrás"
-- do cursor e nunca serem puxados por outros dispositivos).
create or replace function public.set_deleted_at()
returns trigger as $$
begin
  if OLD.deleted_at is null and NEW.deleted_at is not null then
    NEW.deleted_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pets_set_deleted_at on public.pets;
create trigger pets_set_deleted_at
  before update on public.pets
  for each row execute function public.set_deleted_at();
