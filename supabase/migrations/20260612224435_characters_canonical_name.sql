alter table public.characters
  add column if not exists canonical_name text generated always as (
    btrim(
      regexp_replace(
        lower(
          translate(
            name,
            'ÀÁÂÃÄÅĀĂĄÇĆĈĊČÐĎÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÑŃŇÒÓÔÕÖØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÞŠŚŜŞȘŽŹŻàáâãäåāăąçćĉċčðďèéêëēĕėęěìíîïĩīĭįıñńňòóôõöøōŏőùúûüũūŭůűųýÿŷþšśŝşșžźż',
            'AAAAAAAAACCCCCDDEEEEEEEEEIIIIIIIIINNNOOOOOOOOOUUUUUUUUUUYYYBSSSSSZZZaaaaaaaaacccccddeeeeeeeeeiiiiiiiiinnnooooooooouuuuuuuuuuyyybssssszzz'
          )
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  ) stored;

create index if not exists idx_characters_user_canonical_name
  on public.characters(user_id, canonical_name);
