require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ElitligLive'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.10'
  s.source         = { git: 'https://github.com/elitlig/elitlig-mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # HaishinKit 1.9.x API'si (RTMPConnection/RTMPStream/MTHKView/Screen) kullanılıyor.
  # 2.x tamamen farklı (actor tabanlı) bir API'dir: sürümü 1.9 serisinde tut.
  s.dependency 'HaishinKit', '~> 1.9.9'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
