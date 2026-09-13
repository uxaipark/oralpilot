'use client';
import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './select';

type OptionProps = {
  value: string | number;
  disabled?: boolean;
  children: React.ReactNode;
};
type GroupProps = { label: string; children: React.ReactNode };
// Declarative data children consumed by Dropdown; never render native form controls.
export function DropdownOption(_props: OptionProps) {
  return null;
}
export function DropdownGroup(_props: GroupProps) {
  return null;
}

type Entry = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  group?: string;
};
function entriesFrom(children: React.ReactNode, group?: string): Entry[] {
  return React.Children.toArray(children).flatMap((child): Entry[] => {
    if (!React.isValidElement(child)) return [];
    if (child.type === DropdownOption) {
      const props = child.props as OptionProps;
      return [
        {
          value: String(props.value),
          label: props.children,
          disabled: props.disabled,
          group,
        },
      ];
    }
    if (child.type === DropdownGroup) {
      const props = child.props as GroupProps;
      return entriesFrom(props.children, props.label);
    }
    if (child.type === React.Fragment)
      return entriesFrom((child.props as GroupProps).children, group);
    return [];
  });
}
const labelText = (node: React.ReactNode): string =>
  React.Children.toArray(node)
    .map((n) =>
      React.isValidElement(n)
        ? labelText((n.props as { children?: React.ReactNode }).children)
        : String(n),
    )
    .join('');

type DropdownProps = Omit<
  React.ComponentProps<'button'>,
  'value' | 'onChange' | 'children'
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  tone?: 'dark' | 'perio';
};
export function Dropdown({
  value,
  onValueChange,
  children,
  disabled,
  className = '',
  tone = 'dark',
  id,
  ...trigger
}: DropdownProps) {
  const entries = entriesFrom(children);
  const groups = [...new Set(entries.map((item) => item.group))];
  return (
    <Select
      value={String(value)}
      disabled={disabled}
      id={id}
      items={entries}
      onValueChange={(next) => {
        if (next !== null) onValueChange(String(next));
      }}
    >
      <SelectTrigger
        {...trigger}
        id={id}
        className={`app-dropdown ${className}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className={`app-dropdown-menu ${tone === 'perio' ? 'perio-dropdown-menu' : ''}`}
        align="start"
        alignItemWithTrigger={false}
      >
        {groups.map((group) => (
          <SelectGroup key={group ?? '_ungrouped'}>
            {group && <SelectLabel>{group}</SelectLabel>}
            {entries
              .filter((item) => item.group === group)
              .map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  label={labelText(item.label)}
                  disabled={item.disabled}
                >
                  {item.label}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
