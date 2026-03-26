# ============================================================
# Website Generator -Guided Setup Wizard (WPF)
# Walks through AI selection, tool installation, and auth.
# ============================================================

param(
    [string]$UserName = "User",
    [string]$UserEmail = "",
    [string]$AdminName = "",
    [string]$PronounSubject = "They",
    [string]$PronounObject = "them",
    [string]$PronounPossessive = "their",
    [string]$InstallDir = ""
)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms

# ---- Colors ----
$c = @{
    accent     = "#6366F1"; accentDark = "#4F46E5"; accentLight = "#A5B4FC"; accentBg = "#EEF2FF"
    success    = "#22C55E"; successBg  = "#F0FDF4"
    warn       = "#F59E0B"; warnBg     = "#FFFBEB"
    danger     = "#EF4444"; dangerBg   = "#FEF2F2"
    text1      = "#1E293B"; text2      = "#64748B"; text3      = "#94A3B8"
    sidebar    = "#1E1B4B"; sidebarMid = "#312E81"
    bg         = "#F8FAFC"; card       = "#FFFFFF"; border     = "#E2E8F0"
}

# ---- Build XAML ----
# Steps: 1=AI Platform, 2=Editor, 3=Accounts, 4=Tools, 5=GitHub, 6=Cloudflare, 7=AI Setup, 8=Done
$stepNames = @("Choose AI", "Choose Editor", "Accounts", "Install Tools", "GitHub", "Cloudflare", "AI Setup", "All Done!")

$sidebarStepsXaml = ""
for ($i = 0; $i -lt $stepNames.Count; $i++) {
    $n = $i + 1
    $sidebarStepsXaml += @"
                    <StackPanel Orientation="Horizontal" Margin="0,0,0,16">
                        <Border x:Name="S${n}C" Width="30" Height="30" CornerRadius="15" Background="$($c.sidebarMid)">
                            <TextBlock x:Name="S${n}N" Text="$n" Foreground="White" FontSize="13" FontWeight="SemiBold"
                                       HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <TextBlock x:Name="S${n}L" Text="$($stepNames[$i])" Foreground="$($c.accentLight)" FontSize="12.5"
                                   VerticalAlignment="Center" Margin="10,0,0,0"/>
                    </StackPanel>
"@
}

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Website Generator -Setup" Width="920" Height="660"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize"
        Background="$($c.bg)" FontFamily="Segoe UI">
    <Window.Resources>
        <Style x:Key="Card" TargetType="Border">
            <Setter Property="Background" Value="$($c.card)"/>
            <Setter Property="CornerRadius" Value="10"/>
            <Setter Property="BorderBrush" Value="$($c.border)"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="18"/>
            <Setter Property="Margin" Value="0,0,0,10"/>
        </Style>
        <Style x:Key="Btn" TargetType="Button">
            <Setter Property="Background" Value="$($c.accent)"/>
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="FontSize" Value="13.5"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="22,9"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="bd" Background="{TemplateBinding Background}" CornerRadius="7" Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="bd" Property="Background" Value="$($c.accentDark)"/>
                            </Trigger>
                            <Trigger Property="IsEnabled" Value="False">
                                <Setter TargetName="bd" Property="Background" Value="#94A3B8"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
        <Style x:Key="Btn2" TargetType="Button">
            <Setter Property="Background" Value="Transparent"/>
            <Setter Property="Foreground" Value="$($c.text2)"/>
            <Setter Property="FontSize" Value="13.5"/>
            <Setter Property="Padding" Value="22,9"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="BorderBrush" Value="$($c.border)"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="bd" Background="{TemplateBinding Background}" CornerRadius="7"
                                Padding="{TemplateBinding Padding}" BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="{TemplateBinding BorderThickness}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="bd" Property="Background" Value="#F1F5F9"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
    </Window.Resources>
    <Grid>
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="210"/>
            <ColumnDefinition Width="*"/>
        </Grid.ColumnDefinitions>

        <!-- SIDEBAR -->
        <Border Background="$($c.sidebar)">
            <DockPanel>
                <StackPanel DockPanel.Dock="Top" Margin="18,20,18,28">
                    <Border Width="42" Height="42" CornerRadius="10" Background="$($c.accent)" HorizontalAlignment="Left">
                        <TextBlock Text="W" Foreground="White" FontSize="22" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                    </Border>
                    <TextBlock Text="Website Generator" Foreground="White" FontSize="14.5" FontWeight="SemiBold" Margin="0,10,0,0"/>
                    <TextBlock Text="Setup Wizard" Foreground="$($c.accentLight)" FontSize="11.5" Margin="0,2,0,0"/>
                </StackPanel>
                <StackPanel Margin="18,0,18,0" VerticalAlignment="Top">
$sidebarStepsXaml
                </StackPanel>
                <StackPanel DockPanel.Dock="Bottom" Margin="18,0,18,18" VerticalAlignment="Bottom">
                    <Border Height="1" Background="$($c.sidebarMid)" Margin="0,0,0,12"/>
                    <TextBlock Text="$UserName" Foreground="$($c.accentLight)" FontSize="11"/>
                    <TextBlock Text="$UserEmail" Foreground="#6366F1" FontSize="10" Margin="0,1,0,0"/>
                </StackPanel>
            </DockPanel>
        </Border>

        <!-- CONTENT -->
        <DockPanel Grid.Column="1">
            <Border DockPanel.Dock="Bottom" Background="$($c.card)" BorderBrush="$($c.border)" BorderThickness="0,1,0,0" Padding="24,14">
                <DockPanel>
                    <Button x:Name="BtnBack" Content="Back" Style="{StaticResource Btn2}" DockPanel.Dock="Left" Visibility="Collapsed"/>
                    <Button x:Name="BtnNext" Content="Next" Style="{StaticResource Btn}" DockPanel.Dock="Right" HorizontalAlignment="Right"/>
                </DockPanel>
            </Border>
            <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="26,22,26,6">
                <Grid>

<!-- ===== PAGE 1: CHOOSE AI ===== -->
<StackPanel x:Name="P1">
    <TextBlock Text="Choose Your AI Assistant" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock Text="This is the AI that will build your websites. Pick one to start -you can always switch later." Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>

    <Border x:Name="AI_codex" Style="{StaticResource Card}" Cursor="Hand" Tag="codex">
        <DockPanel>
            <RadioButton x:Name="RB_codex" GroupName="ai" DockPanel.Dock="Left" VerticalAlignment="Top" Margin="0,4,14,0"/>
            <StackPanel>
                <DockPanel>
                    <TextBlock Text="`$20/mo" DockPanel.Dock="Right" Foreground="$($c.accent)" FontWeight="SemiBold" FontSize="14"/>
                    <TextBlock Text="Codex (OpenAI)" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                </DockPanel>
                <TextBlock Text="Best for beginners. Works inside VS Code with a chat panel. Powered by the same AI as ChatGPT." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,6"/>
                <TextBlock Text="Requires: ChatGPT Pro subscription (`$20/month)" Foreground="$($c.text3)" FontSize="11.5"/>
            </StackPanel>
        </DockPanel>
    </Border>

    <Border x:Name="AI_claude" Style="{StaticResource Card}" Cursor="Hand" Tag="claude">
        <DockPanel>
            <RadioButton x:Name="RB_claude" GroupName="ai" DockPanel.Dock="Left" VerticalAlignment="Top" Margin="0,4,14,0"/>
            <StackPanel>
                <DockPanel>
                    <TextBlock Text="`$20/mo" DockPanel.Dock="Right" Foreground="$($c.accent)" FontWeight="SemiBold" FontSize="14"/>
                    <TextBlock Text="Claude Code (Anthropic)" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                </DockPanel>
                <TextBlock Text="Most capable. Runs in the terminal alongside your editor. Excellent at complex projects and debugging." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,6"/>
                <TextBlock Text="Requires: Claude Max subscription (`$20/month) or API credits (pay-per-use)" Foreground="$($c.text3)" FontSize="11.5"/>
            </StackPanel>
        </DockPanel>
    </Border>

    <Border x:Name="AI_cursor" Style="{StaticResource Card}" Cursor="Hand" Tag="cursor">
        <DockPanel>
            <RadioButton x:Name="RB_cursor" GroupName="ai" DockPanel.Dock="Left" VerticalAlignment="Top" Margin="0,4,14,0"/>
            <StackPanel>
                <DockPanel>
                    <TextBlock Text="Free to start" DockPanel.Dock="Right" Foreground="$($c.success)" FontWeight="SemiBold" FontSize="14"/>
                    <TextBlock Text="Cursor" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                </DockPanel>
                <TextBlock Text="All-in-one editor with built-in AI. Free tier to try, Pro for unlimited. Replaces VS Code entirely." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,6"/>
                <TextBlock Text="Free tier available. Pro: `$20/month for unlimited usage." Foreground="$($c.text3)" FontSize="11.5"/>
            </StackPanel>
        </DockPanel>
    </Border>
</StackPanel>

<!-- ===== PAGE 2: CHOOSE EDITOR ===== -->
<StackPanel x:Name="P2" Visibility="Collapsed">
    <TextBlock Text="Choose Your Editor" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock x:Name="EditorSubtitle" Text="This is the app where you'll talk to the AI and see your projects." Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>

    <Border x:Name="ED_vscode" Style="{StaticResource Card}" Cursor="Hand" Tag="VS Code">
        <DockPanel>
            <RadioButton x:Name="RB_vscode" GroupName="ed" DockPanel.Dock="Left" VerticalAlignment="Top" Margin="0,4,14,0" IsChecked="True"/>
            <StackPanel>
                <TextBlock Text="VS Code" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                <TextBlock Text="Free editor by Microsoft. Works with Codex, Claude Code, Copilot, and more. Most popular choice." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,4"/>
                <TextBlock Text="Free -download from code.visualstudio.com" Foreground="$($c.text3)" FontSize="11.5"/>
            </StackPanel>
        </DockPanel>
    </Border>

    <Border x:Name="ED_cursor" Style="{StaticResource Card}" Cursor="Hand" Tag="Cursor">
        <DockPanel>
            <RadioButton x:Name="RB_cursorEd" GroupName="ed" DockPanel.Dock="Left" VerticalAlignment="Top" Margin="0,4,14,0"/>
            <StackPanel>
                <TextBlock Text="Cursor" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                <TextBlock Text="AI-focused editor based on VS Code. Has its own built-in AI, but also works with other AI tools." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,4"/>
                <TextBlock Text="Free tier available -download from cursor.com" Foreground="$($c.text3)" FontSize="11.5"/>
            </StackPanel>
        </DockPanel>
    </Border>
</StackPanel>

<!-- ===== PAGE 3: ACCOUNTS ===== -->
<StackPanel x:Name="P3" Visibility="Collapsed">
    <TextBlock Text="Create Your Accounts" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock Text="You need free accounts on these services. Click each link to sign up, then check the box when done. Already have an account? Just check the box." Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>

    <Border Style="{StaticResource Card}">
        <DockPanel>
            <CheckBox x:Name="ChkGH" DockPanel.Dock="Right" Content="Done" VerticalAlignment="Center" FontSize="13" Margin="12,0,0,0"/>
            <StackPanel>
                <TextBlock Text="1. GitHub Account" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                <TextBlock Text="Backs up your website code so nothing gets lost. Takes 2 minutes to create." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,6"/>
                <TextBlock x:Name="GHLink" Text="Click here to sign up at github.com" Foreground="$($c.accent)" FontSize="12.5" Cursor="Hand" TextDecorations="Underline"/>
            </StackPanel>
        </DockPanel>
    </Border>

    <Border Style="{StaticResource Card}">
        <DockPanel>
            <CheckBox x:Name="ChkCF" DockPanel.Dock="Right" Content="Done" VerticalAlignment="Center" FontSize="13" Margin="12,0,0,0"/>
            <StackPanel>
                <TextBlock Text="2. Cloudflare Account" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                <TextBlock Text="Hosts your websites on the internet with a free database. The free plan covers everything you need." Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,6"/>
                <TextBlock x:Name="CFLink" Text="Click here to sign up at cloudflare.com" Foreground="$($c.accent)" FontSize="12.5" Cursor="Hand" TextDecorations="Underline"/>
            </StackPanel>
        </DockPanel>
    </Border>

    <Border Style="{StaticResource Card}" x:Name="AIAccountCard">
        <DockPanel>
            <CheckBox x:Name="ChkAI" DockPanel.Dock="Right" Content="Done" VerticalAlignment="Center" FontSize="13" Margin="12,0,0,0"/>
            <StackPanel>
                <TextBlock x:Name="AIAcctTitle" Text="3. AI Subscription" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)"/>
                <TextBlock x:Name="AIAcctDesc" Text="" Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap" Margin="0,4,0,6"/>
                <TextBlock x:Name="AIAcctLink" Text="" Foreground="$($c.accent)" FontSize="12.5" Cursor="Hand" TextDecorations="Underline"/>
            </StackPanel>
        </DockPanel>
    </Border>
</StackPanel>

<!-- ===== PAGE 4: INSTALL TOOLS ===== -->
<StackPanel x:Name="P4" Visibility="Collapsed">
    <TextBlock Text="Installing Developer Tools" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock Text="These run behind the scenes so the AI can build and deploy websites. This is fully automatic -just sit back." Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>

    <Border Style="{StaticResource Card}" Padding="14">
        <DockPanel><Border x:Name="T1D" Width="10" Height="10" CornerRadius="5" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
        <TextBlock x:Name="T1A" Text="" DockPanel.Dock="Right" VerticalAlignment="Center" Foreground="$($c.text3)" FontSize="12"/>
        <StackPanel><TextBlock Text="Node.js" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="Runs JavaScript -powers all website builds" Foreground="$($c.text2)" FontSize="12"/></StackPanel></DockPanel>
    </Border>
    <Border Style="{StaticResource Card}" Padding="14">
        <DockPanel><Border x:Name="T2D" Width="10" Height="10" CornerRadius="5" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
        <TextBlock x:Name="T2A" Text="" DockPanel.Dock="Right" VerticalAlignment="Center" Foreground="$($c.text3)" FontSize="12"/>
        <StackPanel><TextBlock Text="Git" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="Tracks changes and saves versions of your work" Foreground="$($c.text2)" FontSize="12"/></StackPanel></DockPanel>
    </Border>
    <Border Style="{StaticResource Card}" Padding="14">
        <DockPanel><Border x:Name="T3D" Width="10" Height="10" CornerRadius="5" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
        <TextBlock x:Name="T3A" Text="" DockPanel.Dock="Right" VerticalAlignment="Center" Foreground="$($c.text3)" FontSize="12"/>
        <StackPanel><TextBlock Text="GitHub CLI" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="Lets the AI manage your code backups" Foreground="$($c.text2)" FontSize="12"/></StackPanel></DockPanel>
    </Border>
    <Border Style="{StaticResource Card}" Padding="14">
        <DockPanel><Border x:Name="T4D" Width="10" Height="10" CornerRadius="5" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
        <TextBlock x:Name="T4A" Text="" DockPanel.Dock="Right" VerticalAlignment="Center" Foreground="$($c.text3)" FontSize="12"/>
        <StackPanel><TextBlock Text="Wrangler" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="Deploys your websites and manages databases" Foreground="$($c.text2)" FontSize="12"/></StackPanel></DockPanel>
    </Border>
    <Border Style="{StaticResource Card}" Padding="14">
        <DockPanel><Border x:Name="T5D" Width="10" Height="10" CornerRadius="5" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
        <TextBlock x:Name="T5A" Text="" DockPanel.Dock="Right" VerticalAlignment="Center" Foreground="$($c.text3)" FontSize="12"/>
        <StackPanel><TextBlock x:Name="T5Name" Text="VS Code" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="Your editor -where you talk to the AI" Foreground="$($c.text2)" FontSize="12"/></StackPanel></DockPanel>
    </Border>

    <Border CornerRadius="5" Background="#E2E8F0" Height="6" Margin="0,8,0,2">
        <Border x:Name="TBar" CornerRadius="5" Background="$($c.accent)" Height="6" HorizontalAlignment="Left" Width="0"/>
    </Border>
    <TextBlock x:Name="TStatus" Text="Click Next to begin installation" Foreground="$($c.text2)" FontSize="12" HorizontalAlignment="Center" Margin="0,6,0,0"/>
</StackPanel>

<!-- ===== PAGE 5: GITHUB AUTH ===== -->
<StackPanel x:Name="P5" Visibility="Collapsed">
    <TextBlock Text="Connect to GitHub" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock Text="This lets the AI save your code. It takes about 30 seconds." Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>
    <Border Style="{StaticResource Card}">
        <StackPanel>
            <TextBlock Text="Here's what will happen:" FontSize="14" FontWeight="SemiBold" Foreground="$($c.text1)" Margin="0,0,0,14"/>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,10"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="1" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Click the 'Connect' button below" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,10"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="2" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Your browser opens to GitHub -log in if needed" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,10"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="3" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Click the green 'Authorize' button" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
            <StackPanel Orientation="Horizontal"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="4" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Come back here -it will say Connected" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
        </StackPanel>
    </Border>
    <Border x:Name="GHCard" Style="{StaticResource Card}" Background="$($c.bg)">
        <DockPanel>
            <Border x:Name="GHDot" Width="12" Height="12" CornerRadius="6" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
            <Button x:Name="BtnGH" Content="Connect GitHub" Style="{StaticResource Btn}" DockPanel.Dock="Right" VerticalAlignment="Center"/>
            <TextBlock x:Name="GHTxt" Text="Not connected yet" VerticalAlignment="Center" Foreground="$($c.text2)" FontSize="13.5"/>
        </DockPanel>
    </Border>
</StackPanel>

<!-- ===== PAGE 6: CLOUDFLARE AUTH ===== -->
<StackPanel x:Name="P6" Visibility="Collapsed">
    <TextBlock Text="Connect to Cloudflare" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock Text="This lets the AI put your websites online. Same process -takes about 30 seconds." Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>
    <Border Style="{StaticResource Card}">
        <StackPanel>
            <TextBlock Text="Here's what will happen:" FontSize="14" FontWeight="SemiBold" Foreground="$($c.text1)" Margin="0,0,0,14"/>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,10"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="1" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Click the 'Connect' button below" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,10"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="2" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Your browser opens to Cloudflare -log in if needed" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
            <StackPanel Orientation="Horizontal"><Border Width="26" Height="26" CornerRadius="13" Background="$($c.accentBg)" Margin="0,0,10,0"><TextBlock Text="3" Foreground="$($c.accent)" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><TextBlock Text="Allow access, then come back here" VerticalAlignment="Center" Foreground="$($c.text1)" FontSize="13"/></StackPanel>
        </StackPanel>
    </Border>
    <Border x:Name="CFCard" Style="{StaticResource Card}" Background="$($c.bg)">
        <DockPanel>
            <Border x:Name="CFDot" Width="12" Height="12" CornerRadius="6" Background="#CBD5E1" DockPanel.Dock="Left" VerticalAlignment="Center" Margin="0,0,12,0"/>
            <Button x:Name="BtnCF" Content="Connect Cloudflare" Style="{StaticResource Btn}" DockPanel.Dock="Right" VerticalAlignment="Center"/>
            <TextBlock x:Name="CFTxt" Text="Not connected yet" VerticalAlignment="Center" Foreground="$($c.text2)" FontSize="13.5"/>
        </DockPanel>
    </Border>
</StackPanel>

<!-- ===== PAGE 7: AI SETUP ===== -->
<StackPanel x:Name="P7" Visibility="Collapsed">
    <TextBlock x:Name="AISetupTitle" Text="Set Up Your AI" FontSize="22" FontWeight="Bold" Foreground="$($c.text1)"/>
    <TextBlock x:Name="AISetupSubtitle" Text="" Foreground="$($c.text2)" FontSize="13" TextWrapping="Wrap" Margin="0,6,0,18"/>
    <Border Style="{StaticResource Card}">
        <StackPanel x:Name="AISetupSteps"/>
    </Border>
    <!-- Progress area for auto-install (Claude Code) -->
    <Border x:Name="AISetupProgressCard" Style="{StaticResource Card}" Margin="0,4,0,0" Visibility="Collapsed">
        <StackPanel>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                <Border x:Name="AISetupDot" Width="12" Height="12" CornerRadius="6" Background="#CBD5E1" VerticalAlignment="Center" Margin="0,0,10,0"/>
                <TextBlock x:Name="AISetupStatus" Text="Waiting..." FontSize="13.5" VerticalAlignment="Center" Foreground="$($c.text2)"/>
            </StackPanel>
            <Border Background="$($c.border)" CornerRadius="4" Height="8" Margin="0,0,0,4">
                <Border x:Name="AISetupBar" Background="$($c.accent)" CornerRadius="4" Height="8" HorizontalAlignment="Left" Width="0"/>
            </Border>
        </StackPanel>
    </Border>
    <Border Style="{StaticResource Card}" Background="$($c.accentBg)" Margin="0,4,0,0">
        <StackPanel>
            <TextBlock Text="Tip" FontSize="13" FontWeight="SemiBold" Foreground="$($c.accent)" Margin="0,0,0,4"/>
            <TextBlock x:Name="AISetupTip" Text="" Foreground="$($c.text2)" FontSize="12.5" TextWrapping="Wrap"/>
        </StackPanel>
    </Border>
</StackPanel>

<!-- ===== PAGE 8: DONE ===== -->
<StackPanel x:Name="P8" Visibility="Collapsed">
    <TextBlock Text="You're All Set!" FontSize="26" FontWeight="Bold" Foreground="$($c.text1)" HorizontalAlignment="Center"/>
    <TextBlock x:Name="DoneSub" Text="" Foreground="$($c.text2)" FontSize="13.5" HorizontalAlignment="Center" Margin="0,6,0,24" TextWrapping="Wrap" TextAlignment="Center"/>
    <Border Style="{StaticResource Card}" Background="$($c.accentBg)">
        <StackPanel>
            <TextBlock Text="How to build your first website:" FontSize="15" FontWeight="SemiBold" Foreground="$($c.text1)" Margin="0,0,0,16"/>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,14"><Border Width="34" Height="34" CornerRadius="17" Background="$($c.accent)" Margin="0,0,12,0"><TextBlock Text="1" Foreground="White" FontSize="15" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><StackPanel VerticalAlignment="Center"><TextBlock Text="Open your workspace" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock x:Name="DoneS1" Text="" Foreground="$($c.text2)" FontSize="12"/></StackPanel></StackPanel>
            <StackPanel Orientation="Horizontal" Margin="0,0,0,14"><Border Width="34" Height="34" CornerRadius="17" Background="$($c.accent)" Margin="0,0,12,0"><TextBlock Text="2" Foreground="White" FontSize="15" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><StackPanel VerticalAlignment="Center"><TextBlock Text="Open the AI chat" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="It's in the sidebar of your editor" Foreground="$($c.text2)" FontSize="12"/></StackPanel></StackPanel>
            <StackPanel Orientation="Horizontal"><Border Width="34" Height="34" CornerRadius="17" Background="$($c.accent)" Margin="0,0,12,0"><TextBlock Text="3" Foreground="White" FontSize="15" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><StackPanel VerticalAlignment="Center"><TextBlock Text="Describe what you want!" FontSize="13.5" FontWeight="SemiBold" Foreground="$($c.text1)"/><TextBlock Text="Try: 'Make me a recipe organizer. Call it recipe-book.'" Foreground="$($c.text2)" FontSize="12" TextWrapping="Wrap"/></StackPanel></StackPanel>
        </StackPanel>
    </Border>
</StackPanel>

                </Grid>
            </ScrollViewer>
        </DockPanel>
    </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$w = [Windows.Markup.XamlReader]::Load($reader)
$ui = @{}
$xaml.SelectNodes('//*[@*[contains(translate(name(),"X","x"),"x:Name")]]') | ForEach-Object {
    $n = $_.GetAttribute("x:Name"); if (-not $n) { $n = $_.GetAttribute("Name") }
    if ($n) { $el = $w.FindName($n); if ($el) { $ui[$n] = $el } }
}

$script:step = 1; $script:chosenAI = "codex"; $script:chosenEditor = "VS Code"; $script:toolsDone = $false
$bc = (New-Object System.Windows.Media.BrushConverter)

# ---- Helpers ----
function Refresh-Path { $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") }
function Test-Cmd($cmd) { try { $null = Get-Command $cmd -EA Stop; $true } catch { $false } }
function Set-Dot($dot, $color) { $w.Dispatcher.Invoke([Action]{ $dot.Background = $bc.ConvertFrom($color) }) }
function Set-Act($tb, $msg, $color) { $w.Dispatcher.Invoke([Action]{ $tb.Text = $msg; $tb.Foreground = $bc.ConvertFrom($color) }) }

# ---- Card click → radio select ----
foreach ($tag in @("codex","claude","cursor")) {
    $card = $ui["AI_$tag"]; $rb = $ui["RB_$tag"]
    $card.Add_MouseLeftButtonUp([System.Windows.Input.MouseButtonEventHandler]{
        param($s,$e)
        $ui["RB_$($s.Tag)"].IsChecked = $true
        $script:chosenAI = $s.Tag
    }.GetNewClosure())
}
# Editor card clicks handled below
$ui.ED_vscode.Add_MouseLeftButtonUp({ $ui.RB_vscode.IsChecked = $true; $script:chosenEditor = "VS Code" })
$ui.ED_cursor.Add_MouseLeftButtonUp({ $ui.RB_cursorEd.IsChecked = $true; $script:chosenEditor = "Cursor" })
$ui.RB_codex.IsChecked = $true

# ---- Links ----
$ui.GHLink.Add_MouseLeftButtonUp({ Start-Process "https://github.com/signup" })
$ui.CFLink.Add_MouseLeftButtonUp({ Start-Process "https://dash.cloudflare.com/sign-up" })
$ui.AIAcctLink.Add_MouseLeftButtonUp({
    switch ($script:chosenAI) {
        "codex"  { Start-Process "https://chatgpt.com/" }
        "claude" { Start-Process "https://claude.ai/" }
        "cursor" { Start-Process "https://cursor.com/" }
    }
})

# ---- Navigation ----
function Show-Step($s) {
    $script:step = $s
    for ($i = 1; $i -le 8; $i++) { $ui["P$i"].Visibility = if ($i -eq $s) {"Visible"} else {"Collapsed"} }
    $ui.BtnBack.Visibility = if ($s -gt 1) {"Visible"} else {"Collapsed"}

    # Sidebar highlights
    for ($i = 1; $i -le 8; $i++) {
        $circle = $ui["S${i}C"]; $lbl = $ui["S${i}L"]; $num = $ui["S${i}N"]
        if ($i -lt $s) { $circle.Background = $bc.ConvertFrom($c.success); $lbl.Foreground = $bc.ConvertFrom("#C7D2FE"); $num.Text = [char]0x2713 }
        elseif ($i -eq $s) { $circle.Background = $bc.ConvertFrom($c.accent); $lbl.Foreground = $bc.ConvertFrom("White"); $lbl.FontWeight = "SemiBold" }
        else { $circle.Background = $bc.ConvertFrom($c.sidebarMid); $lbl.Foreground = $bc.ConvertFrom($c.accentLight); $lbl.FontWeight = "Normal" }
    }

    # Button text
    switch ($s) {
        1 { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true }
        2 { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true }
        3 { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true }
        4 { if ($script:toolsDone) { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true } else { $ui.BtnNext.Content = "Install Everything"; $ui.BtnNext.IsEnabled = $true } }
        5 { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true }
        6 { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true }
        7 { if ($script:chosenAI -ne "claude") { $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true } }
        8 { $ui.BtnNext.Content = "Open My Workspace"; $ui.BtnNext.IsEnabled = $true; $ui.BtnBack.Visibility = "Collapsed" }
    }

    # Step-specific init
    if ($s -eq 2) { Update-EditorPage }
    if ($s -eq 3) { Update-AccountsPage }
    if ($s -eq 4) { $ui.T5Name.Text = $script:chosenEditor; Detect-Tools }
    if ($s -eq 5) { Check-GH }
    if ($s -eq 6) { Check-CF }
    if ($s -eq 7) { Update-AISetupPage }
    if ($s -eq 8) { Update-DonePage }
}

function Update-EditorPage {
    if ($script:chosenAI -eq "cursor") {
        $ui.RB_cursorEd.IsChecked = $true; $script:chosenEditor = "Cursor"
        $ui.EditorSubtitle.Text = "Since you chose Cursor as your AI, it comes with its own editor. You can still use VS Code if you prefer."
    } else {
        $ui.EditorSubtitle.Text = "This is the app where you'll talk to the AI and see your projects. VS Code is recommended for most people."
    }
}

function Update-AccountsPage {
    switch ($script:chosenAI) {
        "codex" {
            $ui.AIAcctTitle.Text = "3. ChatGPT Pro Subscription"
            $ui.AIAcctDesc.Text = 'Codex needs a ChatGPT Pro account (`$20/month). Sign up or upgrade your existing ChatGPT account.'
            $ui.AIAcctLink.Text = "Click here to go to chatgpt.com"
        }
        "claude" {
            $ui.AIAcctTitle.Text = "3. Claude Account"
            $ui.AIAcctDesc.Text = 'Claude Code works with a Claude Max subscription (`$20/month) or pay-per-use API credits. Either works.'
            $ui.AIAcctLink.Text = "Click here to go to claude.ai"
        }
        "cursor" {
            $ui.AIAcctTitle.Text = "3. Cursor Account"
            $ui.AIAcctDesc.Text = "Cursor has a free tier to start. Sign up when you first open the app. You can upgrade to Pro later for unlimited AI usage."
            $ui.AIAcctLink.Text = "Click here to go to cursor.com"
        }
    }
}

function Add-StepItem($panel, $num, $text) {
    $sp = New-Object System.Windows.Controls.StackPanel
    $sp.Orientation = "Horizontal"; $sp.Margin = "0,0,0,10"
    $bdr = New-Object System.Windows.Controls.Border
    $bdr.Width = 26; $bdr.Height = 26; $bdr.CornerRadius = "13"; $bdr.Background = $bc.ConvertFrom($c.accentBg); $bdr.Margin = "0,0,10,0"
    $tb1 = New-Object System.Windows.Controls.TextBlock
    $tb1.Text = "$num"; $tb1.Foreground = $bc.ConvertFrom($c.accent); $tb1.FontSize = 12; $tb1.FontWeight = "Bold"; $tb1.HorizontalAlignment = "Center"; $tb1.VerticalAlignment = "Center"
    $bdr.Child = $tb1
    $tb2 = New-Object System.Windows.Controls.TextBlock
    $tb2.Text = $text; $tb2.VerticalAlignment = "Center"; $tb2.Foreground = $bc.ConvertFrom($c.text1); $tb2.FontSize = 13; $tb2.TextWrapping = "Wrap"
    $sp.Children.Add($bdr) | Out-Null; $sp.Children.Add($tb2) | Out-Null
    $panel.Children.Add($sp) | Out-Null
}

function Install-ClaudeCode {
    $ui.BtnNext.IsEnabled = $false; $ui.BtnNext.Content = "Installing..."; $ui.BtnBack.IsEnabled = $false
    $ui.AISetupProgressCard.Visibility = "Visible"
    $rs = [RunspaceFactory]::CreateRunspace(); $rs.Open()
    $rs.SessionStateProxy.SetVariable("w",$w); $rs.SessionStateProxy.SetVariable("ui",$ui)
    $rs.SessionStateProxy.SetVariable("c",$c); $rs.SessionStateProxy.SetVariable("InstallDir",$InstallDir)
    $ps = [PowerShell]::Create(); $ps.Runspace = $rs
    $ps.AddScript({
        $bc2 = (New-Object System.Windows.Media.BrushConverter)
        function RP { $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")+";"+[System.Environment]::GetEnvironmentVariable("Path","User") }
        function TC($cmd) { RP; try { $null = Get-Command $cmd -EA Stop; $true } catch { $false } }
        function SB($frac,$msg) { $w.Dispatcher.Invoke([Action]{ $mw = $ui.AISetupProgressCard.ActualWidth - 40; if($mw -le 0){$mw=520}; $ui.AISetupBar.Width=$mw*$frac; $ui.AISetupStatus.Text=$msg; $ui.AISetupDot.Background=$bc2.ConvertFrom($c.warn) }) }

        RP
        # Step 1: Check if Claude Code is already installed
        SB 0.1 "Checking if Claude Code is installed..."
        if (TC "claude") {
            SB 0.5 "Claude Code is already installed!"
            Start-Sleep -Milliseconds 500
        } else {
            # Step 2: Install via npm
            SB 0.2 "Installing Claude Code (this may take a minute)..."
            if (TC "npm") {
                Start-Process npm -ArgumentList "install -g @anthropic-ai/claude-code" -Wait -NoNewWindow 2>&1 | Out-Null
                RP
                if (TC "claude") {
                    SB 0.5 "Claude Code installed successfully!"
                    Start-Sleep -Milliseconds 500
                } else {
                    $w.Dispatcher.Invoke([Action]{ $ui.AISetupDot.Background=$bc2.ConvertFrom($c.danger); $ui.AISetupStatus.Text="Install failed - you can install manually later with: npm install -g @anthropic-ai/claude-code"; $ui.AISetupStatus.Foreground=$bc2.ConvertFrom($c.danger); $ui.BtnNext.Content="Next"; $ui.BtnNext.IsEnabled=$true; $ui.BtnBack.IsEnabled=$true })
                    return
                }
            } else {
                $w.Dispatcher.Invoke([Action]{ $ui.AISetupDot.Background=$bc2.ConvertFrom($c.danger); $ui.AISetupStatus.Text="Node.js not found - go back and install tools first"; $ui.AISetupStatus.Foreground=$bc2.ConvertFrom($c.danger); $ui.BtnNext.Content="Next"; $ui.BtnNext.IsEnabled=$true; $ui.BtnBack.IsEnabled=$true })
                return
            }
        }

        # Step 3: Launch Claude Code in the workspace so the user can sign in
        SB 0.8 "Opening Claude Code - sign in with your browser..."
        RP
        $wsPath = $InstallDir
        if (-not $wsPath) { $wsPath = [System.IO.Directory]::GetCurrentDirectory() }
        Start-Process cmd -ArgumentList "/c cd /d `"$wsPath`" && claude" -PassThru | Out-Null

        Start-Sleep 2
        SB 1.0 "Claude Code is open! Sign in with your browser, then come back and click Next."
        $w.Dispatcher.Invoke([Action]{ $ui.AISetupDot.Background=$bc2.ConvertFrom($c.success); $ui.AISetupStatus.Foreground=$bc2.ConvertFrom($c.success); $ui.BtnNext.Content="Next"; $ui.BtnNext.IsEnabled=$true; $ui.BtnBack.IsEnabled=$true })
    }) | Out-Null; $ps.BeginInvoke() | Out-Null
}

function Update-AISetupPage {
    $ui.AISetupSteps.Children.Clear()
    $ui.AISetupProgressCard.Visibility = "Collapsed"
    switch ($script:chosenAI) {
        "codex" {
            $ui.AISetupTitle.Text = "Set Up Codex"
            $ui.AISetupSubtitle.Text = "Almost done! Just install the Codex extension in your editor and sign in."
            $steps = @(
                "Open $($script:chosenEditor)",
                "Go to the Extensions panel (click the puzzle piece icon on the left, or press Ctrl+Shift+X)",
                "Search for 'Codex' and install the official OpenAI extension",
                "Click 'Sign In' in the Codex panel and log in with your ChatGPT account",
                "That's it! The Codex chat panel appears in the sidebar"
            )
            $ui.AISetupTip.Text = "When Codex asks for a permission level, choose 'Agent (Full Access)' so it can build and deploy without asking you for every little thing."
            $n = 1; foreach ($s in $steps) { Add-StepItem $ui.AISetupSteps $n $s; $n++ }
        }
        "claude" {
            $ui.AISetupTitle.Text = "Setting Up Claude Code"
            $ui.AISetupSubtitle.Text = "Sit tight - installing Claude Code and opening it for you automatically."
            $steps = @(
                "Installing Claude Code on your computer",
                "Opening Claude Code - a window will pop up",
                "Sign in with your browser when it asks (just click Authorize)",
                "Come back here and click Next when you're signed in"
            )
            $ui.AISetupTip.Text = "You can also use Claude Code inside VS Code with the Claude Code extension. Search for it in the Extensions panel after setup."
            $n = 1; foreach ($s in $steps) { Add-StepItem $ui.AISetupSteps $n $s; $n++ }
            # Auto-start the install + launch
            Install-ClaudeCode
        }
        "cursor" {
            $ui.AISetupTitle.Text = "Set Up Cursor"
            $ui.AISetupSubtitle.Text = "Almost done! Cursor has AI built right in. Just sign in."
            $steps = @(
                "Open Cursor (it should already be installed from the previous step)",
                "When it asks you to sign in, create a Cursor account or log in",
                "Open your workspace: File, then Open Folder, then pick your websites folder",
                "The AI chat panel is already in the sidebar - start chatting!"
            )
            $ui.AISetupTip.Text = 'Cursor''s free tier gives you limited AI usage. If you run out, you can upgrade to Pro for unlimited usage, or switch to a different AI tool. Your workspace works with all of them.'
            $n = 1; foreach ($s in $steps) { Add-StepItem $ui.AISetupSteps $n $s; $n++ }
        }
    }
}

function Update-DonePage {
    $ui.DoneSub.Text = "Everything is set up for $UserName. Time to build some websites!"
    $ui.DoneS1.Text = 'Double-click "Website Generator" on your desktop'
}

# ---- Tool detection ----
function Detect-Tools {
    $cmds = @("node","git","gh","wrangler")
    $dots = @($ui.T1D,$ui.T2D,$ui.T3D,$ui.T4D)
    $acts = @($ui.T1A,$ui.T2A,$ui.T3A,$ui.T4A)
    for ($i=0; $i -lt 4; $i++) {
        if (Test-Cmd $cmds[$i]) { Set-Dot $dots[$i] $c.success; Set-Act $acts[$i] "Installed" $c.success }
        else { Set-Dot $dots[$i] "#CBD5E1"; Set-Act $acts[$i] "Not installed" $c.text3 }
    }
    $edCmd = switch ($script:chosenEditor) { "VS Code" { "code" }; "Cursor" { "cursor" }; default { "" } }
    if ($edCmd -and (Test-Cmd $edCmd)) { Set-Dot $ui.T5D $c.success; Set-Act $ui.T5A "Installed" $c.success }
    else { Set-Dot $ui.T5D "#CBD5E1"; Set-Act $ui.T5A "Not installed" $c.text3 }
}

# ---- Install tools (background thread) ----
function Install-AllTools {
    $ui.BtnNext.IsEnabled = $false; $ui.BtnNext.Content = "Installing..."; $ui.BtnBack.IsEnabled = $false
    $rs = [RunspaceFactory]::CreateRunspace(); $rs.Open()
    $rs.SessionStateProxy.SetVariable("w", $w); $rs.SessionStateProxy.SetVariable("ui", $ui)
    $rs.SessionStateProxy.SetVariable("c", $c); $rs.SessionStateProxy.SetVariable("UserName", $UserName)
    $rs.SessionStateProxy.SetVariable("UserEmail", $UserEmail); $rs.SessionStateProxy.SetVariable("chosenEditor", $script:chosenEditor)
    $ps = [PowerShell]::Create(); $ps.Runspace = $rs
    $ps.AddScript({
        $bc2 = (New-Object System.Windows.Media.BrushConverter)
        function RP { $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")+";"+[System.Environment]::GetEnvironmentVariable("Path","User") }
        function TC($cmd) { RP; try { $null = Get-Command $cmd -EA Stop; $true } catch { $false } }
        function SD($dot,$col) { $w.Dispatcher.Invoke([Action]{ $dot.Background = $bc2.ConvertFrom($col) }) }
        function SA($tb,$msg,$col) { $w.Dispatcher.Invoke([Action]{ $tb.Text = $msg; $tb.Foreground = $bc2.ConvertFrom($col) }) }
        function SP($f,$t) { $w.Dispatcher.Invoke([Action]{ $mw = $ui.TBar.Parent.ActualWidth; if($mw -le 0){$mw=560}; $ui.TBar.Width=$mw*$f; $ui.TStatus.Text=$t }) }

        $tools = @(
            @{Cmd="node";Dot=$ui.T1D;Act=$ui.T1A;WingetId="OpenJS.NodeJS.LTS";Label="Node.js"},
            @{Cmd="git";Dot=$ui.T2D;Act=$ui.T2A;WingetId="Git.Git";Label="Git"},
            @{Cmd="gh";Dot=$ui.T3D;Act=$ui.T3A;WingetId="GitHub.cli";Label="GitHub CLI"}
        )
        $total = 5; $done = 0
        foreach ($t in $tools) {
            SD $t.Dot $c.warn; SA $t.Act "Checking..." $c.warn; SP ($done/$total) "Checking $($t.Label)..."
            if (TC $t.Cmd) { SD $t.Dot $c.success; SA $t.Act "Installed" $c.success }
            else {
                SD $t.Dot $c.warn; SA $t.Act "Installing..." $c.warn; SP ($done/$total) "Installing $($t.Label)..."
                Start-Process winget -ArgumentList "install --id $($t.WingetId) --accept-source-agreements --accept-package-agreements -h" -Wait -NoNewWindow 2>&1 | Out-Null
                RP; if (TC $t.Cmd) { SD $t.Dot $c.success; SA $t.Act "Installed" $c.success }
                else { SD $t.Dot $c.danger; SA $t.Act "Failed" $c.danger }
            }
            $done++
        }
        # Wrangler via npm
        SD $ui.T4D $c.warn; SA $ui.T4A "Checking..." $c.warn; SP ($done/$total) "Checking Wrangler..."
        if (TC "wrangler") { SD $ui.T4D $c.success; SA $ui.T4A "Installed" $c.success }
        elseif (TC "npm") {
            SD $ui.T4D $c.warn; SA $ui.T4A "Installing..." $c.warn; SP ($done/$total) "Installing Wrangler..."
            Start-Process npm -ArgumentList "install -g wrangler" -Wait -NoNewWindow 2>&1 | Out-Null
            RP; if (TC "wrangler") { SD $ui.T4D $c.success; SA $ui.T4A "Installed" $c.success }
            else { SD $ui.T4D $c.danger; SA $ui.T4A "Failed" $c.danger }
        } else { SD $ui.T4D $c.danger; SA $ui.T4A "Needs Node.js" $c.danger }
        $done++
        # Editor
        SD $ui.T5D $c.warn; SA $ui.T5A "Checking..." $c.warn; SP ($done/$total) "Checking $chosenEditor..."
        $ec = switch ($chosenEditor) { "VS Code" { "code" }; "Cursor" { "cursor" }; default { "" } }
        if ($ec -and (TC $ec)) { SD $ui.T5D $c.success; SA $ui.T5A "Installed" $c.success }
        elseif ($chosenEditor -eq "VS Code") {
            SD $ui.T5D $c.warn; SA $ui.T5A "Installing..." $c.warn; SP ($done/$total) "Installing VS Code..."
            Start-Process winget -ArgumentList "install --id Microsoft.VisualStudioCode --accept-source-agreements --accept-package-agreements -h" -Wait -NoNewWindow 2>&1 | Out-Null
            RP; if (TC "code") { SD $ui.T5D $c.success; SA $ui.T5A "Installed" $c.success }
            else { SD $ui.T5D $c.danger; SA $ui.T5A "Failed" $c.danger }
        } elseif ($chosenEditor -eq "Cursor") {
            SD $ui.T5D $c.warn; SA $ui.T5A "Installing..." $c.warn; SP ($done/$total) "Installing Cursor..."
            Start-Process winget -ArgumentList "install --id Anysphere.Cursor --accept-source-agreements --accept-package-agreements -h" -Wait -NoNewWindow 2>&1 | Out-Null
            RP; if (TC "cursor") { SD $ui.T5D $c.success; SA $ui.T5A "Installed" $c.success }
            else { SD $ui.T5D $c.warn; SA $ui.T5A "Install from cursor.com" $c.warn }
        }
        $done++
        # Git config
        SP 1.0 "Configuring Git..."
        RP; if (TC "git") {
            Start-Process git -ArgumentList "config --global user.name `"$UserName`"" -Wait -NoNewWindow
            Start-Process git -ArgumentList "config --global user.email `"$UserEmail`"" -Wait -NoNewWindow
            Start-Process git -ArgumentList "config --global init.defaultBranch main" -Wait -NoNewWindow
        }
        Start-Sleep -Milliseconds 400; SP 1.0 "All done!"
        $w.Dispatcher.Invoke([Action]{ $ui.BtnNext.Content = "Next"; $ui.BtnNext.IsEnabled = $true; $ui.BtnBack.IsEnabled = $true })
    }) | Out-Null
    $ps.BeginInvoke() | Out-Null; $script:toolsDone = $true
}

# ---- Auth ----
function Check-GH { Refresh-Path; if (Test-Cmd "gh") { $r = & gh auth status 2>&1; if ($LASTEXITCODE -eq 0) { $ui.GHDot.Background = $bc.ConvertFrom($c.success); $ui.GHTxt.Text = "Connected!"; $ui.GHTxt.Foreground = $bc.ConvertFrom($c.success); $ui.BtnGH.Content = "Connected"; $ui.BtnGH.IsEnabled = $false; $ui.GHCard.Background = $bc.ConvertFrom($c.successBg) } } }
function Check-CF { Refresh-Path; if (Test-Cmd "wrangler") { $r = & wrangler whoami 2>&1 | Out-String; if ($r -match "logged in") { $ui.CFDot.Background = $bc.ConvertFrom($c.success); $ui.CFTxt.Text = "Connected!"; $ui.CFTxt.Foreground = $bc.ConvertFrom($c.success); $ui.BtnCF.Content = "Connected"; $ui.BtnCF.IsEnabled = $false; $ui.CFCard.Background = $bc.ConvertFrom($c.successBg) } } }

function Run-Auth($fullCmd, $checkCmd, $dot, $txt, $btn, $card) {
    $btn.Content = "Waiting..."; $btn.IsEnabled = $false
    $dot.Background = $bc.ConvertFrom($c.warn); $txt.Text = "Check your browser..."; $txt.Foreground = $bc.ConvertFrom($c.warn)
    $rs = [RunspaceFactory]::CreateRunspace(); $rs.Open()
    $rs.SessionStateProxy.SetVariable("w",$w)
    $rs.SessionStateProxy.SetVariable("fullCmd",$fullCmd); $rs.SessionStateProxy.SetVariable("checkCmd",$checkCmd)
    $rs.SessionStateProxy.SetVariable("dot",$dot); $rs.SessionStateProxy.SetVariable("txt",$txt)
    $rs.SessionStateProxy.SetVariable("btn",$btn); $rs.SessionStateProxy.SetVariable("card",$card)
    $rs.SessionStateProxy.SetVariable("c",$c)
    $ps = [PowerShell]::Create(); $ps.Runspace = $rs
    $ps.AddScript({
        $bc2 = (New-Object System.Windows.Media.BrushConverter)
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")+";"+[System.Environment]::GetEnvironmentVariable("Path","User")
        # Use cmd /c to run the auth command in a visible window so the CLI can open a browser
        $proc = Start-Process cmd -ArgumentList "/c $fullCmd" -PassThru
        $proc.WaitForExit()
        Start-Sleep 2
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")+";"+[System.Environment]::GetEnvironmentVariable("Path","User")
        # Check if auth succeeded
        $checkProc = Start-Process cmd -ArgumentList "/c $checkCmd" -Wait -NoNewWindow -RedirectStandardOutput "$env:TEMP\wg-auth-check.txt" -RedirectStandardError "$env:TEMP\wg-auth-check-err.txt" -PassThru
        $stdout = ""; $stderr = ""
        if (Test-Path "$env:TEMP\wg-auth-check.txt") { $stdout = Get-Content "$env:TEMP\wg-auth-check.txt" -Raw -ErrorAction SilentlyContinue }
        if (Test-Path "$env:TEMP\wg-auth-check-err.txt") { $stderr = Get-Content "$env:TEMP\wg-auth-check-err.txt" -Raw -ErrorAction SilentlyContinue }
        $combined = "$stdout $stderr"
        $ok = ($checkProc.ExitCode -eq 0) -or ($combined -match "Logged in") -or ($combined -match "logged in")
        $w.Dispatcher.Invoke([Action]{
            if ($ok) { $dot.Background=$bc2.ConvertFrom($c.success); $txt.Text="Connected!"; $txt.Foreground=$bc2.ConvertFrom($c.success); $btn.Content="Connected"; $card.Background=$bc2.ConvertFrom($c.successBg) }
            else { $dot.Background=$bc2.ConvertFrom($c.danger); $txt.Text="Not connected yet - try again"; $txt.Foreground=$bc2.ConvertFrom($c.danger); $btn.Content="Retry"; $btn.IsEnabled=$true }
        })
    }) | Out-Null; $ps.BeginInvoke() | Out-Null
}

$ui.BtnGH.Add_Click({ Run-Auth "gh auth login --web --git-protocol https" "gh auth status" $ui.GHDot $ui.GHTxt $ui.BtnGH $ui.GHCard })
$ui.BtnCF.Add_Click({ Run-Auth "wrangler login" "wrangler whoami" $ui.CFDot $ui.CFTxt $ui.BtnCF $ui.CFCard })

# ---- Main nav ----
$ui.BtnNext.Add_Click({
    switch ($script:step) {
        1 { if ($ui.RB_claude.IsChecked) { $script:chosenAI = "claude" } elseif ($ui.RB_cursor.IsChecked) { $script:chosenAI = "cursor" } else { $script:chosenAI = "codex" }; Show-Step 2 }
        2 { if ($ui.RB_cursorEd.IsChecked) { $script:chosenEditor = "Cursor" } else { $script:chosenEditor = "VS Code" }; Show-Step 3 }
        3 { Show-Step 4 }
        4 { if ($script:toolsDone) { Show-Step 5 } else { Install-AllTools } }
        5 { Show-Step 6 }
        6 { Show-Step 7 }
        7 { Show-Step 8 }
        8 {
            # Open workspace
            $wsFile = Join-Path $InstallDir "Website Generator.code-workspace"
            if (Test-Path $wsFile) {
                $edCmd = switch ($script:chosenEditor) { "VS Code" { "code" }; "Cursor" { "cursor" }; default { "" } }
                if ($edCmd -and (Test-Cmd $edCmd)) { Start-Process $edCmd -ArgumentList "`"$wsFile`"" }
                else { Start-Process $wsFile }
            }
            $w.Close()
        }
    }
})
$ui.BtnBack.Add_Click({ if ($script:step -gt 1) { Show-Step ($script:step - 1) } })

Show-Step 1
$w.ShowDialog() | Out-Null
