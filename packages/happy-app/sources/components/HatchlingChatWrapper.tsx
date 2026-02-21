import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { HatchlingChatView } from './HatchlingChatView';

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
}));

export const HatchlingChatWrapper = React.memo(() => {
    return (
        <View style={styles.container}>
            <HatchlingChatView />
        </View>
    );
});
