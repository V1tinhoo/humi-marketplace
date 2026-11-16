-- =====================================================================
-- HUMI · CRIAR / ATUALIZAR USUÁRIOS PELO BANCO (um script só)
--
-- Como usar: edite a LISTA abaixo (troque, adicione ou remova pessoas) e
-- rode no Supabase → SQL Editor → Run.
--   * E-mail que ainda não existe  → a conta é CRIADA, igual ao cadastro do
--     site (login com e-mail e senha, e-mail já confirmado, perfil criado
--     pelo próprio gatilho do cadastro).
--   * E-mail que já existe         → os dados da pessoa são ATUALIZADOS
--     (a senha só muda se você preencher "nova_senha").
-- Pode rodar quantas vezes quiser: nada é duplicado.
--
-- Campos de cada pessoa (só "email" e "nome" são obrigatórios):
--   email, senha (mín. 8, só na criação), nova_senha (troca a senha),
--   nome, host (true/false), admin (true/false),
--   foto (link https da imagem: aparece no perfil e no Explorar),
--   pais (nome em inglês: "Brazil", "Portugal"…), cidade, bio,
--   idiomas (em inglês: ["Portuguese","English"]), interesses,
--   frase, preco_audio e preco_video (em reais por minuto, ex.: 1.00),
--   categorias: ["talk","cultures"]  (talk = Só conversar, play = Jogar juntos,
--     cultures = Explorar culturas, meet = Conhecer pessoas; padrão: talk),
--   publicar (aparece no Explorar), online, fuso ("America/Sao_Paulo"),
--   horarios: [{"dia":1,"inicio":"18:00","fim":"22:00"}]  (0 = domingo … 6 = sábado)
--
-- Para PUBLICAR (aparecer no Explorar) o perfil precisa ter: frase, bio,
-- pelo menos uma categoria, horários e foto. Se faltar algo, aparece o erro
-- "Complete your profile before publishing." e nada daquela rodada é salvo.
--
-- Avaliações: toda conta já nasce pronta para avaliar e ser avaliada; as
-- avaliações em si nascem das chamadas (botão de avaliar no fim da chamada).
-- Use só com pessoas reais que autorizaram o cadastro.
-- =====================================================================
do $$
declare
  -- ======================= LISTA (edite aqui) =======================
  lista jsonb := $lista$
  [
    {
      "email": "maria.exemplo@gmail.com",
      "senha": "TroqueEstaSenha123",
      "nome": "Maria Silva",
      "foto": "https://exemplo.com/foto-da-maria.jpg",
      "host": true,
      "pais": "Brazil", "cidade": "Recife",
      "bio": "Professora de inglês, adoro conversar sobre viagens e séries.",
      "idiomas": ["Portuguese", "English"],
      "interesses": ["Viagens", "Séries", "Música"],
      "categorias": ["talk", "cultures"],
      "frase": "Inglês leve, sem pressão, com quem ama conversar",
      "preco_audio": 1.00, "preco_video": 1.50,
      "publicar": true, "online": true, "fuso": "America/Recife",
      "horarios": [
        {"dia": 1, "inicio": "18:00", "fim": "22:00"},
        {"dia": 3, "inicio": "18:00", "fim": "22:00"},
        {"dia": 6, "inicio": "10:00", "fim": "14:00"}
      ]
    },
    {
      "email": "joao.exemplo@gmail.com",
      "senha": "OutraSenha456",
      "nome": "João Souza",
      "host": false
    }
  ]
  $lista$;
  -- ==================================================================

  p jsonb;
  w jsonb;
  v_email text;
  v_id uuid;
  v_host_id uuid;
  v_is_host boolean;
  v_novo boolean;
  v_min bigint := public.setting('price_min_cents_per_minute');
  v_max bigint := public.setting('price_max_cents_per_minute');
  v_audio integer;
  v_video integer;
  v_fuso text;
  v_criados int := 0;
  v_atualizados int := 0;
begin
  for p in select * from jsonb_array_elements(lista) loop
    v_email := lower(trim(p ->> 'email'));
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'E-mail inválido: %', coalesce(p ->> 'email', '(vazio)');
    end if;
    if coalesce(trim(p ->> 'nome'), '') = '' then raise exception 'Falta o nome de %', v_email; end if;
    v_is_host := coalesce((p ->> 'host')::boolean, false);
    v_fuso := coalesce(nullif(p ->> 'fuso', ''), 'America/Sao_Paulo');

    select id into v_id from auth.users where lower(email) = v_email;
    v_novo := v_id is null;

    if v_novo then
      -- 1) Login, igual ao cadastro do site (e-mail já confirmado).
      if length(coalesce(p ->> 'senha', '')) < 8 then raise exception 'Senha de % precisa ter pelo menos 8 caracteres.', v_email; end if;
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
        extensions.crypt(p ->> 'senha', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', trim(p ->> 'nome'), 'role', case when v_is_host then 'host' else 'customer' end),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
              'email', now(), now(), now());
      v_criados := v_criados + 1;
    else
      if length(coalesce(p ->> 'nova_senha', '')) >= 8 then
        update auth.users set encrypted_password = extensions.crypt(p ->> 'nova_senha', extensions.gen_salt('bf')), updated_at = now() where id = v_id;
      end if;
      v_atualizados := v_atualizados + 1;
    end if;

    -- 2) Perfil (o gatilho do cadastro cria; aqui completamos/atualizamos só o que veio preenchido).
    if nullif(trim(p ->> 'foto'), '') is not null and trim(p ->> 'foto') !~ '^https://' then
      raise exception 'A foto de % precisa ser um link que começa com https://', v_email;
    end if;
    update public.profiles set
      full_name = trim(p ->> 'nome'),
      avatar_url = coalesce(nullif(trim(p ->> 'foto'), ''), avatar_url),
      country   = coalesce(p ->> 'pais', country),
      city      = coalesce(p ->> 'cidade', city),
      bio       = coalesce(p ->> 'bio', bio),
      languages = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'idiomas') x), languages),
      interests = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'interesses') x), interests)
    where id = v_id;

    -- 3) Admin (só muda se o campo vier preenchido).
    if (p ->> 'admin') is not null then
      if (p ->> 'admin')::boolean then
        insert into public.platform_admins (user_id) values (v_id) on conflict do nothing;
      else
        delete from public.platform_admins where user_id = v_id;
      end if;
    end if;

    -- 4) Host: perfil, preço e horários.
    if v_is_host then
      update public.profiles set role = 'host' where id = v_id and role = 'customer';
      insert into public.host_profiles (user_id, display_name)
      values (v_id, left(split_part(trim(p ->> 'nome'), ' ', 1), 40))
      on conflict (user_id) do nothing;
      select id into v_host_id from public.host_profiles where user_id = v_id;

      update public.host_profiles set
        display_name = left(split_part(trim(p ->> 'nome'), ' ', 1), 40),
        tagline      = coalesce(p ->> 'frase', tagline),
        description  = coalesce(p ->> 'bio', description),
        timezone     = v_fuso,
        categories   = coalesce(
                         (select array_agg(x) from jsonb_array_elements_text(p -> 'categorias') x),
                         case when cardinality(categories) = 0 then array['talk'] else categories end),
        is_available = coalesce((p ->> 'online')::boolean, is_available)
      where id = v_host_id;

      if p ? 'preco_audio' then
        v_audio := round((p ->> 'preco_audio')::numeric * 100);
        v_video := case when nullif(p ->> 'preco_video', '') is null then null else round((p ->> 'preco_video')::numeric * 100) end;
        if v_audio < v_min or v_audio > v_max or (v_video is not null and (v_video < v_min or v_video > v_max)) then
          raise exception 'Preço de % fora dos limites do site (R$ % a R$ % por minuto).', v_email, v_min / 100.0, v_max / 100.0;
        end if;
        insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute)
        values (v_host_id, v_audio, v_video)
        on conflict (host_id) do update set audio_cents_per_minute = excluded.audio_cents_per_minute,
                                            video_cents_per_minute = excluded.video_cents_per_minute, updated_at = now();
      end if;

      if p ? 'horarios' then
        delete from public.host_availability where host_id = v_host_id;   -- substitui pelos horários da lista
        for w in select * from jsonb_array_elements(p -> 'horarios') loop
          insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone)
          values (v_host_id, (w ->> 'dia')::smallint, (w ->> 'inicio')::time, (w ->> 'fim')::time, v_fuso);
        end loop;
      end if;

      -- Publicar por último: o site exige frase, bio, categoria, horários e foto.
      if (p ->> 'publicar') is not null then
        update public.host_profiles set is_published = (p ->> 'publicar')::boolean where id = v_host_id;
      end if;

      -- "Online agora" só aparece com sinal recente; marca agora para o teste.
      if coalesce((p ->> 'online')::boolean, false) then
        update public.host_profiles set last_seen_at = now() where id = v_host_id;
      end if;
    end if;

    raise notice '% %  (id %)', case when v_novo then 'Criada:    ' else 'Atualizada:' end, v_email, v_id;
  end loop;

  raise notice 'Pronto: % conta(s) criada(s), % atualizada(s).', v_criados, v_atualizados;
end $$;
