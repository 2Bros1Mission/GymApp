-- ============================================================
-- In-app messaging (trainer ↔ client)
-- Creates conversations and messages tables with RLS policies.
-- ============================================================

-- 1. Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_unique_pair unique (trainer_id, client_id)
);

alter table public.conversations enable row level security;

-- Only participants can see their conversations
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = trainer_id or auth.uid() = client_id);

-- Either party can start a conversation (but must be one of the participants)
create policy "Participants can create conversations"
  on public.conversations for insert
  with check (
    auth.uid() in (trainer_id, client_id)
    and exists (
      select 1 from public.trainer_clients
      where trainer_clients.trainer_id = conversations.trainer_id
        and trainer_clients.client_id = conversations.client_id
        and trainer_clients.status = 'active'
    )
  );

-- Allow updating last_message_at
create policy "Participants can update conversations"
  on public.conversations for update
  using (auth.uid() = trainer_id or auth.uid() = client_id)
  with check (auth.uid() = trainer_id or auth.uid() = client_id);

-- 2. Messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Only conversation participants can read messages
create policy "Participants can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.trainer_id = auth.uid() or c.client_id = auth.uid())
    )
  );

-- Only conversation participants can send messages
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.trainer_id = auth.uid() or c.client_id = auth.uid())
    )
  );

-- No UPDATE policy on messages — marking as read is done via RPC only

-- 3. Indexes for performance
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at desc);

create index if not exists idx_conversations_trainer
  on public.conversations (trainer_id);

create index if not exists idx_conversations_client
  on public.conversations (client_id);

create index if not exists idx_messages_unread
  on public.messages (conversation_id, sender_id, read_at)
  where read_at is null;

-- 4. RPC: send_message — atomically inserts message + updates conversation.last_message_at
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text
) returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_conv record;
  v_message_id uuid;
begin
  -- Validate conversation exists and sender is a participant
  select * into v_conv
  from public.conversations
  where id = p_conversation_id
    and (trainer_id = v_sender_id or client_id = v_sender_id);

  if not found then
    return json_build_object('success', false, 'error', 'conversation_not_found');
  end if;

  -- Validate content
  if p_content is null or char_length(trim(p_content)) = 0 then
    return json_build_object('success', false, 'error', 'empty_message');
  end if;

  if char_length(p_content) > 2000 then
    return json_build_object('success', false, 'error', 'message_too_long');
  end if;

  -- Insert message
  insert into public.messages (conversation_id, sender_id, content)
  values (p_conversation_id, v_sender_id, trim(p_content))
  returning id into v_message_id;

  -- Update conversation timestamp
  update public.conversations
  set last_message_at = now()
  where id = p_conversation_id;

  return json_build_object('success', true, 'message_id', v_message_id);
end;
$$;

-- 5. RPC: get_or_create_conversation — finds existing or creates new conversation
create or replace function public.get_or_create_conversation(
  p_other_user_id uuid
) returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_other_role text;
  v_trainer_id uuid;
  v_client_id uuid;
  v_conv_id uuid;
begin
  -- Get roles
  select role into v_caller_role from public.profiles where id = v_caller_id;
  select role into v_other_role from public.profiles where id = p_other_user_id;

  if v_caller_role is null or v_other_role is null then
    return json_build_object('success', false, 'error', 'user_not_found');
  end if;

  -- Determine trainer and client
  if v_caller_role = 'trainer' and v_other_role = 'client' then
    v_trainer_id := v_caller_id;
    v_client_id := p_other_user_id;
  elsif v_caller_role = 'client' and v_other_role = 'trainer' then
    v_trainer_id := p_other_user_id;
    v_client_id := v_caller_id;
  else
    return json_build_object('success', false, 'error', 'invalid_roles');
  end if;

  -- Verify active connection
  if not exists (
    select 1 from public.trainer_clients
    where trainer_id = v_trainer_id
      and client_id = v_client_id
      and status = 'active'
  ) then
    return json_build_object('success', false, 'error', 'no_active_connection');
  end if;

  -- Find or create conversation (handles concurrent requests safely)
  insert into public.conversations (trainer_id, client_id)
  values (v_trainer_id, v_client_id)
  on conflict (trainer_id, client_id) do nothing
  returning id into v_conv_id;

  -- If conflict occurred, fetch the existing one
  if v_conv_id is null then
    select id into v_conv_id
    from public.conversations
    where trainer_id = v_trainer_id and client_id = v_client_id;
  end if;

  return json_build_object('success', true, 'conversation_id', v_conv_id);
end;
$$;

-- 6. RPC: get_conversations — returns conversations with last message and unread count in one query
create or replace function public.get_conversations()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        c.id,
        c.trainer_id,
        c.client_id,
        c.last_message_at,
        c.created_at,
        tp.name as trainer_name,
        tp.email as trainer_email,
        cp.name as client_name,
        cp.email as client_email,
        lm.content as last_message_content,
        coalesce(unread.cnt, 0) as unread_count
      from public.conversations c
      join public.profiles tp on tp.id = c.trainer_id
      join public.profiles cp on cp.id = c.client_id
      left join lateral (
        select m.content
        from public.messages m
        where m.conversation_id = c.id
        order by m.created_at desc
        limit 1
      ) lm on true
      left join lateral (
        select count(*)::int as cnt
        from public.messages m
        where m.conversation_id = c.id
          and m.sender_id != v_user_id
          and m.read_at is null
      ) unread on true
      where c.trainer_id = v_user_id or c.client_id = v_user_id
      order by c.last_message_at desc
    ) t
  );
end;
$$;

-- 7. RPC: mark_messages_read — only updates read_at, nothing else
create or replace function public.mark_messages_read(p_conversation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id != auth.uid()
    and read_at is null;
end;
$$;

-- 7. Enable Realtime for messages table
alter publication supabase_realtime add table public.messages;
