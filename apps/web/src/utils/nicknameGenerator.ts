/**
 * Generate nicknames based on character description, role, and chat mentions
 */
export const generateNicknames = (
  name: string,
  description?: string,
  role?: string,
  tags?: string[]
): string[] => {
  const nicknames: string[] = [];
  const nameParts = name.split(' ');
  const firstName = nameParts[0];
  
  // Add first name as nickname
  if (nameParts.length > 1) {
    nicknames.push(firstName);
  }
  
  // Generate nicknames from description keywords
  if (description) {
    const desc = description.toLowerCase();
    
    // Extract personality-based nicknames
    if (desc.includes('spontaneous') || desc.includes('adventure')) {
      nicknames.push('Wild ' + firstName);
    }
    if (desc.includes('wise') || desc.includes('mentor')) {
      nicknames.push('Wise ' + firstName);
    }
    if (desc.includes('creative') || desc.includes('artist')) {
      nicknames.push('Creative ' + firstName);
    }
    if (desc.includes('supportive') || desc.includes('friend')) {
      nicknames.push('Supportive ' + firstName);
    }
    if (desc.includes('brilliant') || desc.includes('smart')) {
      nicknames.push('Brilliant ' + firstName);
    }
    
    // Role-based nicknames
    if (role) {
      const roleLower = role.toLowerCase();
      if (roleLower.includes('buddy') || roleLower.includes('partner')) {
        nicknames.push(firstName + ' the ' + role.split(' ')[0]);
      }
    }
  }
  
  // Tag-based nicknames
  if (tags && tags.length > 0) {
    const primaryTag = tags[0];
    if (primaryTag && !nicknames.includes(primaryTag + ' ' + firstName)) {
      nicknames.push(primaryTag.charAt(0).toUpperCase() + primaryTag.slice(1) + ' ' + firstName);
    }
  }
  
  // Add initials if name has multiple parts
  if (nameParts.length > 1) {
    const initials = nameParts.map(part => part[0]).join('');
    if (initials.length > 1) {
      nicknames.push(initials);
    }
  }
  
  // Add shortened versions
  if (firstName.length > 4) {
    nicknames.push(firstName.substring(0, 4));
  }
  
  // Remove duplicates and limit to 5
  return Array.from(new Set(nicknames)).slice(0, 5);
};

