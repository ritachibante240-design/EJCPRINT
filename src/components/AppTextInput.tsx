import React from 'react';
import { TextInput as NativeTextInput, type TextInputProps } from 'react-native';
import { colors } from '../theme';

export default function AppTextInput(props: TextInputProps) {
  return (
    <NativeTextInput
      {...props}
      placeholderTextColor={props.placeholderTextColor ?? colors.muted}
    />
  );
}
