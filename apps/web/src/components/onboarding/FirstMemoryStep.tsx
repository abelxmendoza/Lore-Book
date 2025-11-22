import { useState } from 'react';
import { Tag, MapPin, UserPlus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface FirstMemoryStepProps {
  memory: string;
  setMemory: (value: string) => void;
  tags: string[];
  setTags: (tags: string[]) => void;
  location: string;
  setLocation: (value: string) => void;
  people: string[];
  setPeople: (people: string[]) => void;
}

export const FirstMemoryStep = ({
  memory,
  setMemory,
  tags,
  setTags,
  location,
  setLocation,
  people,
  setPeople,
}: FirstMemoryStepProps) => {
  const [tagInput, setTagInput] = useState('');
  const [peopleInput, setPeopleInput] = useState('');

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleAddPerson = () => {
    if (peopleInput.trim() && !people.includes(peopleInput.trim())) {
      setPeople([...people, peopleInput.trim()]);
      setPeopleInput('');
    }
  };

  const handleRemovePerson = (personToRemove: string) => {
    setPeople(people.filter(person => person !== personToRemove));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-white/5 p-6">
        <h3 className="font-semibold text-white mb-4">What would you like to remember?</h3>
        <textarea
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder="Write about something that happened today, a thought you had, or a memory you want to capture..."
          className="w-full h-32 rounded-lg bg-black/40 border border-border/60 text-white p-4 placeholder:text-white/40 focus:outline-none focus:border-primary/50 resize-none"
        />
        
        {/* Tags */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-primary" />
            <label className="text-sm font-medium text-white/80">Tags</label>
          </div>
          <div className="flex gap-2 mb-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add a tag..."
              className="flex-1 bg-black/40 border-border/60 text-white placeholder:text-white/40"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddTag}
              size="sm"
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm border border-primary/30"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-primary/70"
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            <label className="text-sm font-medium text-white/80">Location</label>
          </div>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where did this happen?"
            className="bg-black/40 border-border/60 text-white placeholder:text-white/40"
          />
        </div>

        {/* People */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <label className="text-sm font-medium text-white/80">People</label>
          </div>
          <div className="flex gap-2 mb-2">
            <Input
              value={peopleInput}
              onChange={(e) => setPeopleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddPerson();
                }
              }}
              placeholder="Add a person..."
              className="flex-1 bg-black/40 border-border/60 text-white placeholder:text-white/40"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleAddPerson}
              size="sm"
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              Add
            </Button>
          </div>
          {people.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {people.map((person) => (
                <span
                  key={person}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm border border-primary/30"
                >
                  {person}
                  <button
                    onClick={() => handleRemovePerson(person)}
                    className="hover:text-primary/70"
                    aria-label={`Remove ${person}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
        <p className="text-sm text-white/80">
          💡 <strong>Tip:</strong> The more details you add, the better LoreKeeper can help you discover patterns and connections later.
        </p>
      </div>
    </div>
  );
};

